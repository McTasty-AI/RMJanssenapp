import type { SupabaseClient } from '@supabase/supabase-js';
import { format, getISOWeek, getISOWeekYear, getYear } from 'date-fns';
import { nl } from 'date-fns/locale';

type Tx = {
  id: string;
  license_plate: string;
  transaction_date: string; // yyyy-MM-dd
  transaction_time: string; // HH:mm
  amount: number;
  vat_rate: number;
  country: string | null;
  invoice_line_id: string | null;
  status: 'new' | 'matched' | 'ignored';
};

type Invoice = { id: string; reference: string | null; status: string | null };
type InvoiceLine = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
};

function parseInvoiceRef(ref: string | null): { week?: number; year?: number; plate?: string } {
  const s = String(ref || '');
  const m = s.match(/week\s+(\d{1,2})\s*-\s*(\d{4}).*\(([A-Za-z0-9-]+)\)/i);
  if (!m) return {};
  return { week: Number(m[1]), year: Number(m[2]), plate: m[3].toUpperCase() };
}

function dateKey(plate: string, dateIso: string) {
  return `${plate.toUpperCase()}|${dateIso}`;
}

function dateToWeekYear(dateIso: string): { week: number; year: number } {
  const d = new Date(dateIso);
  // IMPORTANT: ISO week belongs to ISO week-year (not calendar year)
  return { week: getISOWeek(d), year: getISOWeekYear(d) };
}

function extractDateLabel(description: string): string | null {
  const m = String(description || '').match(/(\d{2}-\d{2}-\d{4})/);
  return m ? m[1] : null;
}

export type ReconcileResult = {
  processedTransactions: number;
  matchedTransactions: number;
  unmatchedGroups: Array<{ license_plate: string; transaction_date: string; reason: string }>;
  updatedInvoiceLines: number;
};

export async function reconcileNewTollTransactions(admin: SupabaseClient): Promise<ReconcileResult> {
  const { data: txs, error } = await admin
    .from('toll_transactions')
    .select('id,license_plate,transaction_date,transaction_time,amount,vat_rate,country,invoice_line_id,status')
    .eq('status', 'new')
    .is('invoice_line_id', null)
    .limit(5000);

  if (error) throw error;
  const newTxs = (txs || []) as Tx[];
  if (newTxs.length === 0) {
    return { processedTransactions: 0, matchedTransactions: 0, unmatchedGroups: [], updatedInvoiceLines: 0 };
  }

  // Fetch concept invoices once and build lookup by (plate|year|week)
  const { data: invoices, error: invErr } = await admin
    .from('invoices')
    .select('id,reference,status')
    .eq('status', 'concept')
    .limit(5000);
  if (invErr) throw invErr;

  const invoiceByPlateWeek = new Map<string, Invoice>();
  (invoices || []).forEach((inv: any) => {
    const { plate, week, year } = parseInvoiceRef(inv.reference);
    if (!plate || !week || !year) return;
    invoiceByPlateWeek.set(`${plate}|${year}|${week}`, inv as Invoice);
  });

  // Cache invoice lines per invoice
  const invoiceLinesCache = new Map<string, InvoiceLine[]>();
  async function getInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
    const cached = invoiceLinesCache.get(invoiceId);
    if (cached) return cached;
    const { data, error } = await admin
      .from('invoice_lines')
      .select('id,invoice_id,description,quantity,unit_price,vat_rate')
      .eq('invoice_id', invoiceId);
    if (error) throw error;
    const lines = (data || []) as InvoiceLine[];
    invoiceLinesCache.set(invoiceId, lines);
    return lines;
  }

  // Group new transactions by plate+date
  const groups = new Map<string, Tx[]>();
  for (const tx of newTxs) {
    const key = dateKey(tx.license_plate, tx.transaction_date);
    const arr = groups.get(key) || [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const unmatchedGroups: ReconcileResult['unmatchedGroups'] = [];
  let matchedTransactions = 0;
  let updatedInvoiceLines = 0;

  for (const [key, groupTxs] of groups.entries()) {
    const [plate, dateIso] = key.split('|');
    const { week, year } = dateToWeekYear(dateIso);
    const invoice = invoiceByPlateWeek.get(`${plate}|${year}|${week}`);
    if (!invoice) {
      unmatchedGroups.push({ license_plate: plate, transaction_date: dateIso, reason: 'Geen conceptfactuur gevonden (kenteken/week)' });
      continue;
    }

    const lines = await getInvoiceLines(invoice.id);
    const dateLabel = format(new Date(dateIso), 'dd-MM-yyyy', { locale: nl });
    const tolLines = lines.filter((l) => {
      const desc = String(l.description || '').toLowerCase();
      return desc.includes('tol') && desc.includes(dateLabel.toLowerCase());
    });
    if (tolLines.length === 0) {
      unmatchedGroups.push({ license_plate: plate, transaction_date: dateIso, reason: 'Geen tol-factuurregel gevonden voor datum' });
      continue;
    }

    // Prefer updating a "blank" placeholder line first (unit_price=0 and quantity=0)
    const blankTolLines = tolLines.filter((l) => Number(l.unit_price) === 0 && Number(l.quantity || 0) === 0);
    const candidateLines = blankTolLines.length > 0 ? blankTolLines : tolLines;

    // If multiple tol lines exist for the date, try to split by country labels in description;
    // otherwise, update the first matching line with the full day sum.
    const sumAll = groupTxs.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const roundedAll = Math.round((sumAll + Number.EPSILON) * 100) / 100;

    let updates: Array<{ lineId: string; amount: number; txIds: string[] }> = [];
    if (candidateLines.length >= 2) {
      const byCountry = new Map<string, Tx[]>();
      for (const tx of groupTxs) {
        const c = (tx.country || '').toUpperCase() || 'UNKNOWN';
        byCountry.set(c, [...(byCountry.get(c) || []), tx]);
      }

      // Map typical country labels inside invoice descriptions
      const pickLineForCountry = (country: string): InvoiceLine | undefined => {
        const c = country.toUpperCase();
        if (c === 'BE') return candidateLines.find((l) => String(l.description).toLowerCase().includes('belg'));
        if (c === 'DE') return candidateLines.find((l) => String(l.description).toLowerCase().includes('duits'));
        if (c === 'FR') return candidateLines.find((l) => String(l.description).toLowerCase().includes('fran'));
        return undefined;
      };

      for (const [country, txList] of byCountry.entries()) {
        const target = pickLineForCountry(country);
        if (!target) continue;
        const sum = txList.reduce((acc, t) => acc + Number(t.amount || 0), 0);
        const rounded = Math.round((sum + Number.EPSILON) * 100) / 100;
        updates.push({ lineId: target.id, amount: rounded, txIds: txList.map((t) => t.id) });
      }
    }

    if (updates.length === 0) {
      // Fallback: one line gets full amount
      updates = [{ lineId: candidateLines[0].id, amount: roundedAll, txIds: groupTxs.map((t) => t.id) }];
    }

    for (const u of updates) {
      // Determine VAT rate for this update (only set if consistent)
      const txForUpdate = groupTxs.filter((t) => u.txIds.includes(t.id));
      const vatSet = new Set<number>(txForUpdate.map((t) => Number((t as any).vat_rate ?? 21)));
      const vatRateToSet = vatSet.size === 1 ? Array.from(vatSet)[0] : null;

      const { error: lineErr } = await admin
        .from('invoice_lines')
        .update({
          quantity: 1,
          unit_price: u.amount,
          total: u.amount,
          ...(vatRateToSet != null ? { vat_rate: vatRateToSet } : {}),
        })
        .eq('id', u.lineId);
      if (lineErr) throw lineErr;
      updatedInvoiceLines += 1;

      const { error: txErr } = await admin
        .from('toll_transactions')
        .update({ invoice_line_id: u.lineId, status: 'matched' })
        .in('id', u.txIds);
      if (txErr) throw txErr;
      matchedTransactions += u.txIds.length;
    }
  }

  return {
    processedTransactions: newTxs.length,
    matchedTransactions,
    unmatchedGroups,
    updatedInvoiceLines,
  };
}

export type TollDashboard = {
  matched: Array<{
    license_plate: string;
    transaction_date: string;
    amount: number;
    invoice_line_id: string;
    invoice_id?: string;
    invoice_reference?: string | null;
  }>;
  unmatched: Array<{
    license_plate: string;
    transaction_date: string;
    amount: number;
    count: number;
    txIds: string[];
    week_id: string;
    reason: string;
    suggested_invoice_id?: string;
    suggested_invoice_reference?: string | null;
  }>;
  missingToll: Array<{ invoice_id: string; invoice_reference: string | null; invoice_line_id: string; dateLabel: string; license_plate: string }>;
  weekOverview: Array<{
    week_id: string; // YYYY-WW
    license_plate: string;
    matched_amount: number;
    unmatched_amount: number;
    missing_toll_count: number;
    ok: boolean;
  }>;
};

export async function buildTollDashboard(admin: SupabaseClient, opts?: { daysBack?: number }): Promise<TollDashboard> {
  const daysBack = opts?.daysBack ?? 120;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: txs, error: txErr } = await admin
    .from('toll_transactions')
    .select('id,license_plate,transaction_date,amount,invoice_line_id,status')
    .gte('transaction_date', sinceIso)
    .limit(10000);
  if (txErr) throw txErr;

  const all = (txs || []) as Array<Pick<Tx, 'id' | 'license_plate' | 'transaction_date' | 'amount' | 'invoice_line_id' | 'status'>>;
  const txKeySet = new Set(all.map((t) => dateKey(t.license_plate, t.transaction_date)));

  // Matched summary grouped by invoice_line_id (then plate/date)
  const matchedMap = new Map<string, { license_plate: string; transaction_date: string; amount: number; invoice_line_id: string }>();
  for (const t of all) {
    if (t.status !== 'matched' || !t.invoice_line_id) continue;
    const k = `${t.invoice_line_id}|${t.license_plate}|${t.transaction_date}`;
    const cur = matchedMap.get(k) || { license_plate: t.license_plate, transaction_date: t.transaction_date, amount: 0, invoice_line_id: t.invoice_line_id };
    cur.amount += Number(t.amount || 0);
    matchedMap.set(k, cur);
  }

  // Unmatched summary grouped by plate/date
  const unmatchedMap = new Map<string, { license_plate: string; transaction_date: string; amount: number; count: number; txIds: string[] }>();
  for (const t of all) {
    if (t.status !== 'new' || t.invoice_line_id) continue;
    const k = dateKey(t.license_plate, t.transaction_date);
    const cur = unmatchedMap.get(k) || { license_plate: t.license_plate, transaction_date: t.transaction_date, amount: 0, count: 0, txIds: [] };
    cur.amount += Number(t.amount || 0);
    cur.count += 1;
    cur.txIds.push((t as any).id);
    unmatchedMap.set(k, cur);
  }

  // Missing Toll: placeholder invoice lines exist but no transactions imported yet
  const { data: conceptInvoices, error: invErr } = await admin
    .from('invoices')
    .select('id,reference,status')
    .eq('status', 'concept')
    .limit(5000);
  if (invErr) throw invErr;

  const invoicesById = new Map<string, Invoice>();
  (conceptInvoices || []).forEach((i: any) => invoicesById.set(i.id, i as Invoice));

  const invoiceIds = Array.from(invoicesById.keys());
  const missingToll: TollDashboard['missingToll'] = [];
  const invoiceByPlateWeek = new Map<string, Invoice>();
  invoicesById.forEach((inv) => {
    const { plate, week, year } = parseInvoiceRef(inv.reference);
    if (!plate || !week || !year) return;
    invoiceByPlateWeek.set(`${plate}|${year}|${week}`, inv);
  });

  const invoiceLinesCache = new Map<string, InvoiceLine[]>();
  const getInvoiceLines = async (invoiceId: string): Promise<InvoiceLine[]> => {
    const cached = invoiceLinesCache.get(invoiceId);
    if (cached) return cached;
    const { data, error } = await admin
      .from('invoice_lines')
      .select('id,invoice_id,description,quantity,unit_price,vat_rate')
      .eq('invoice_id', invoiceId);
    if (error) throw error;
    const lines = (data || []) as InvoiceLine[];
    invoiceLinesCache.set(invoiceId, lines);
    return lines;
  };

  // fetch placeholder tol lines in chunks
  const chunkSize = 200;
  for (let i = 0; i < invoiceIds.length; i += chunkSize) {
    const chunk = invoiceIds.slice(i, i + chunkSize);
    const { data: lines, error: lErr } = await admin
      .from('invoice_lines')
      .select('id,invoice_id,description,quantity,unit_price')
      .in('invoice_id', chunk)
      .ilike('description', '%tol%');
    if (lErr) throw lErr;
    for (const line of (lines || []) as any[]) {
      if (Number(line.unit_price) !== 0 || Number(line.quantity || 0) !== 0) continue;
      const inv = invoicesById.get(line.invoice_id);
      if (!inv) continue;
      const { plate } = parseInvoiceRef(inv.reference);
      if (!plate) continue;
      const dateLabel = extractDateLabel(line.description);
      if (!dateLabel) continue;
      // Convert dd-MM-yyyy to yyyy-MM-dd
      const [dd, mm, yyyy] = dateLabel.split('-');
      const dateIso = `${yyyy}-${mm}-${dd}`;
      if (!txKeySet.has(dateKey(plate, dateIso))) {
        missingToll.push({
          invoice_id: line.invoice_id,
          invoice_reference: inv.reference,
          invoice_line_id: line.id,
          dateLabel,
          license_plate: plate,
        });
      }
    }
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Enrich matched rows with invoice reference (kenmerk) via invoice_lines -> invoices
  const matchedRows = Array.from(matchedMap.values())
    .map((m) => ({ ...m, amount: round2(m.amount) }))
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));

  const invoiceLineIds = Array.from(new Set(matchedRows.map((m) => m.invoice_line_id)));
  const invoiceIdByLineId = new Map<string, string>();
  if (invoiceLineIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < invoiceLineIds.length; i += chunkSize) {
      const chunk = invoiceLineIds.slice(i, i + chunkSize);
      const { data: lines, error } = await admin
        .from('invoice_lines')
        .select('id,invoice_id')
        .in('id', chunk);
      if (error) throw error;
      (lines || []).forEach((l: any) => invoiceIdByLineId.set(l.id, l.invoice_id));
    }
  }
  const invoiceIdsForMatched = Array.from(new Set(Array.from(invoiceIdByLineId.values())));
  const invoiceRefById = new Map<string, string | null>();
  if (invoiceIdsForMatched.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < invoiceIdsForMatched.length; i += chunkSize) {
      const chunk = invoiceIdsForMatched.slice(i, i + chunkSize);
      const { data: invs, error } = await admin.from('invoices').select('id,reference').in('id', chunk);
      if (error) throw error;
      (invs || []).forEach((inv: any) => invoiceRefById.set(inv.id, inv.reference ?? null));
    }
  }

  const matchedEnriched = matchedRows.map((m) => {
    const invoice_id = invoiceIdByLineId.get(m.invoice_line_id);
    return {
      ...m,
      invoice_id,
      invoice_reference: invoice_id ? invoiceRefById.get(invoice_id) ?? null : null,
    };
  });

  const weekIdFromDateIso = (dateIso: string) => {
    const d = new Date(dateIso);
    // IMPORTANT: ISO week belongs to ISO week-year (not calendar year)
    const y = getISOWeekYear(d);
    const w = String(getISOWeek(d)).padStart(2, '0');
    return `${y}-${w}`;
  };

  // Week overview by week + plate: OK if no unmatched + no missing toll placeholders
  const weekKeyTo = new Map<string, { week_id: string; license_plate: string; matched_amount: number; unmatched_amount: number; missing_toll_count: number }>();
  const addWeek = (week_id: string, license_plate: string, patch: Partial<{ matched_amount: number; unmatched_amount: number; missing_toll_count: number }>) => {
    const k = `${week_id}|${license_plate}`;
    const cur =
      weekKeyTo.get(k) || { week_id, license_plate, matched_amount: 0, unmatched_amount: 0, missing_toll_count: 0 };
    cur.matched_amount += patch.matched_amount || 0;
    cur.unmatched_amount += patch.unmatched_amount || 0;
    cur.missing_toll_count += patch.missing_toll_count || 0;
    weekKeyTo.set(k, cur);
  };

  matchedEnriched.forEach((m) => addWeek(weekIdFromDateIso(m.transaction_date), m.license_plate, { matched_amount: m.amount }));
  Array.from(unmatchedMap.values()).forEach((u) =>
    addWeek(weekIdFromDateIso(u.transaction_date), u.license_plate, { unmatched_amount: round2(u.amount) })
  );
  missingToll.forEach((m) => {
    // m.dateLabel is dd-MM-yyyy, translate to ISO
    const [dd, mm, yyyy] = m.dateLabel.split('-');
    const iso = `${yyyy}-${mm}-${dd}`;
    addWeek(weekIdFromDateIso(iso), m.license_plate, { missing_toll_count: 1 });
  });

  const weekOverview = Array.from(weekKeyTo.values())
    .map((w) => ({
      ...w,
      matched_amount: round2(w.matched_amount),
      unmatched_amount: round2(w.unmatched_amount),
      ok: w.unmatched_amount === 0 && w.missing_toll_count === 0,
    }))
    .sort((a, b) => (a.week_id === b.week_id ? (a.license_plate < b.license_plate ? -1 : 1) : a.week_id < b.week_id ? 1 : -1));

  // Build unmatched reasons + suggested invoice (based on plate+week and presence of tol placeholder)
  const unmatchedWithReason: TollDashboard['unmatched'] = [];
  for (const u of Array.from(unmatchedMap.values())) {
    const week_id = weekIdFromDateIso(u.transaction_date);
    const { week, year } = dateToWeekYear(u.transaction_date);
    const invoice = invoiceByPlateWeek.get(`${u.license_plate.toUpperCase()}|${year}|${week}`);
    if (!invoice) {
      unmatchedWithReason.push({
        ...u,
        week_id,
        amount: round2(u.amount),
        reason:
          'Geen conceptfactuur gevonden voor deze week/kenteken. Controleer of er een conceptfactuur is met kenmerk “Week XX - YYYY (KENTEKEN)”.',
      });
      continue;
    }

    const dateLabel = format(new Date(u.transaction_date), 'dd-MM-yyyy', { locale: nl });
    const lines = await getInvoiceLines(invoice.id);
    const hasTolLineForDate = lines.some((l) => {
      const desc = String(l.description || '').toLowerCase();
      return desc.includes('tol') && desc.includes(dateLabel.toLowerCase());
    });
    unmatchedWithReason.push({
      ...u,
      week_id,
      amount: round2(u.amount),
      reason: hasTolLineForDate
        ? 'Conceptfactuur gevonden, maar deze transacties zijn nog niet gekoppeld. Gebruik “Koppel aan factuur”.'
        : `Conceptfactuur gevonden (${dateLabel}), maar er is geen tolregel (placeholder) voor deze datum. Gebruik “Koppel aan factuur” om automatisch een tolregel te laten aanmaken.`,
      suggested_invoice_id: invoice.id,
      suggested_invoice_reference: invoice.reference,
    });
  }

  return {
    matched: matchedEnriched,
    unmatched: unmatchedWithReason.sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1)),
    missingToll: missingToll.sort((a, b) => (a.dateLabel < b.dateLabel ? 1 : -1)),
    weekOverview,
  };
}

