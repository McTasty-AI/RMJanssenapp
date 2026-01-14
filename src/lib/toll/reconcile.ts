import type { SupabaseClient } from '@supabase/supabase-js';
import { format, getYear } from 'date-fns';
import { getCustomWeek, getCustomWeekYear } from '../utils';
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
  // Custom week calculation: Week 1 starts on first Monday of January
  return { week: getCustomWeek(d), year: getCustomWeekYear(d) };
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

/**
 * Adds toll to a specific invoice by finding matching toll transactions
 * and creating/updating invoice lines for them
 */
export async function addTollToInvoice(
  admin: SupabaseClient,
  invoiceId: string
): Promise<{ matchedTransactions: number; updatedInvoiceLines: number; message: string }> {
  // Fetch invoice details
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select('id,reference,status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (invErr) throw invErr;
  if (!invoice) {
    throw new Error('Factuur niet gevonden');
  }
  if (invoice.status !== 'concept') {
    throw new Error('Alleen conceptfacturen kunnen tol krijgen');
  }

  // Parse invoice reference to get plate/week/year
  const { plate, week, year } = parseInvoiceRef(invoice.reference);
  if (!plate || !week || !year) {
    throw new Error('Factuur heeft geen geldig kenmerk (week/kenteken)');
  }

  // Find all toll transactions for this plate/week, regardless of status
  // This includes both unmatched and matched transactions (in case invoice was deleted/recreated)
  const { data: txs, error: txErr } = await admin
    .from('toll_transactions')
    .select('id,license_plate,transaction_date,transaction_time,amount,vat_rate,country,invoice_line_id,status')
    .eq('license_plate', plate.toUpperCase())
    .limit(5000);
  if (txErr) throw txErr;

  const allTxs = (txs || []) as Tx[];
  
  // Filter transactions that belong to this week
  const matchingTxs: Tx[] = [];
  for (const tx of allTxs) {
    const { week: txWeek, year: txYear } = dateToWeekYear(tx.transaction_date);
    if (txWeek === week && txYear === year) {
      matchingTxs.push(tx);
    }
  }

  if (matchingTxs.length === 0) {
    return { matchedTransactions: 0, updatedInvoiceLines: 0, message: `Geen toltransacties gevonden voor week ${week} van ${year} en kenteken ${plate}` };
  }

  // Check if transactions are already linked to this invoice
  // If they're linked to other invoices, we'll unlink them first
  const transactionsToLink: Tx[] = [];
  const transactionsToUnlink: Tx[] = [];
  
  // Get all unique invoice_line_ids that transactions are linked to
  const linkedLineIds = matchingTxs
    .filter(tx => tx.invoice_line_id)
    .map(tx => tx.invoice_line_id!)
    .filter((id, index, arr) => arr.indexOf(id) === index); // unique
  
  let linkedLinesMap = new Map<string, string>(); // line_id -> invoice_id
  
  if (linkedLineIds.length > 0) {
    // Fetch all invoice lines in one query
    const { data: lines, error: linesErr } = await admin
      .from('invoice_lines')
      .select('id,invoice_id')
      .in('id', linkedLineIds);
    
    if (linesErr) {
      console.warn('Error checking invoice_lines:', linesErr);
    } else {
      (lines || []).forEach((line: any) => {
        linkedLinesMap.set(line.id, line.invoice_id);
      });
    }
  }
  
  for (const tx of matchingTxs) {
    if (!tx.invoice_line_id) {
      // Unmatched transaction - can be linked directly
      transactionsToLink.push(tx);
    } else {
      const lineInvoiceId = linkedLinesMap.get(tx.invoice_line_id);
      if (!lineInvoiceId || lineInvoiceId !== invoiceId) {
        // Linked to different invoice (or orphaned) - unlink and relink to this invoice
        transactionsToUnlink.push(tx);
        transactionsToLink.push(tx);
      }
      // If lineInvoiceId === invoiceId, transaction is already linked to this invoice - skip it
    }
  }

  // Unlink transactions that are linked to other invoices
  if (transactionsToUnlink.length > 0) {
    const unlinkIds = transactionsToUnlink.map(t => t.id);
    const { error: unlinkErr } = await admin
      .from('toll_transactions')
      .update({ invoice_line_id: null, status: 'new' })
      .in('id', unlinkIds);
    if (unlinkErr) throw unlinkErr;
  }

  if (transactionsToLink.length === 0) {
    return { matchedTransactions: 0, updatedInvoiceLines: 0, message: 'Alle toltransacties zijn al gekoppeld aan deze factuur' };
  }

  const candidateTxs = transactionsToLink;

  // Get existing invoice lines
  const { data: lines, error: lineErr } = await admin
    .from('invoice_lines')
    .select('id,invoice_id,description,quantity,unit_price,vat_rate')
    .eq('invoice_id', invoiceId);
  if (lineErr) throw lineErr;
  const existingLines = (lines || []) as InvoiceLine[];

  // Group transactions by plate+date+country+vat_rate
  // This ensures we match on: kenteken, datum, land, VAT percentage
  const groups = new Map<string, Tx[]>();
  for (const tx of candidateTxs) {
    const vatRate = Number(tx.vat_rate ?? 21);
    const country = (tx.country || '').toUpperCase() || 'UNKNOWN';
    const key = `${dateKey(tx.license_plate, tx.transaction_date)}|${country}|${vatRate}`;
    const arr = groups.get(key) || [];
    arr.push(tx);
    groups.set(key, arr);
  }

  let matchedTransactions = 0;
  let updatedInvoiceLines = 0;

  for (const [key, groupTxs] of groups.entries()) {
    const parts = key.split('|');
    const plate = parts[0];
    const dateIso = parts[1];
    const country = parts[2];
    
    // Get VAT rate directly from the transactions in this group (not from the key)
    // All transactions in a group should have the same VAT rate since they're grouped by it
    const vatRates = groupTxs.map(tx => Number(tx.vat_rate ?? 21));
    const uniqueVatRates = Array.from(new Set(vatRates));
    if (uniqueVatRates.length !== 1) {
      console.warn(`Group has multiple VAT rates: ${uniqueVatRates.join(', ')}. Using first transaction's VAT rate.`);
    }
    const vatRate = uniqueVatRates[0] ?? 21; // Use first transaction's VAT rate, or 21 as fallback
    
    const dateLabel = format(new Date(dateIso), 'dd-MM-yyyy', { locale: nl });
    const weekday = format(new Date(dateIso), 'EEEE', { locale: nl });

    // Verify that all transactions belong to the correct week (already filtered, but double-check)
    const { week: txWeek, year: txYear } = dateToWeekYear(dateIso);
    if (txWeek !== week || txYear !== year) {
      console.warn(`Transaction date ${dateIso} does not match invoice week ${year}-${week}`);
      continue;
    }

    // Verify that all transactions have the correct license plate (already filtered, but double-check)
    if (plate.toUpperCase() !== plate.toUpperCase()) {
      console.warn(`Transaction plate ${plate} does not match invoice plate ${plate}`);
      continue;
    }

    // Determine country label for matching
    let countryLabel = '';
    if (country === 'BE') countryLabel = 'belgië';
    else if (country === 'DE') countryLabel = 'duitsland';
    else if (country === 'FR') countryLabel = 'frankrijk';

    // Filter tol lines by ALL criteria: kenteken (via invoice), tol, datum, land, VAT percentage
    // Note: kenteken is already verified via invoice reference, week is verified above
    const tolLines = existingLines.filter((l) => {
      const desc = String(l.description || '').toLowerCase();
      const lineVatRate = Number(l.vat_rate ?? 21);
      
      // Must contain "tol"
      if (!desc.includes('tol')) return false;
      
      // Must contain the date
      if (!desc.includes(dateLabel.toLowerCase())) return false;
      
      // Must have matching VAT rate
      if (lineVatRate !== vatRate) return false;
      
      // Must match country if country is known
      if (countryLabel && !desc.includes(countryLabel)) return false;
      
      return true;
    });

    // If no line exists for this VAT rate + country combination, look for blank placeholder lines
    // Blank lines should still match on: tol, datum, VAT rate, and optionally country
    const blankTolLines = existingLines.filter((l) => {
      const desc = String(l.description || '').toLowerCase();
      const lineVatRate = Number(l.vat_rate ?? 21);
      
      // Must contain "tol"
      if (!desc.includes('tol')) return false;
      
      // Must contain the date
      if (!desc.includes(dateLabel.toLowerCase())) return false;
      
      // Must have matching VAT rate
      if (lineVatRate !== vatRate) return false;
      
      // Must be blank (quantity=0 and unit_price=0)
      if (Number(l.unit_price) !== 0 || Number(l.quantity || 0) !== 0) return false;
      
      // If country is known, prefer matching country, but allow any blank line as fallback
      // (we'll update it with the correct country)
      return true;
    });

    let targetLine: InvoiceLine | undefined;
    
    // Prefer exact match: tol + datum + land + VAT rate
    if (tolLines.length > 0) {
      // Prefer blank placeholder lines with matching VAT rate and country
      const blankWithVatAndCountry = tolLines.filter((l) => 
        Number(l.unit_price) === 0 && Number(l.quantity || 0) === 0
      );
      if (blankWithVatAndCountry.length > 0) {
        targetLine = blankWithVatAndCountry[0];
      } else {
        // Use first matching line (should be unique based on all criteria)
        targetLine = tolLines[0];
      }
    } else if (blankTolLines.length > 0) {
      // If no exact match, use blank placeholder line
      // Prefer one that matches country if available
      if (countryLabel) {
        const countryMatched = blankTolLines.find((l) => 
          String(l.description).toLowerCase().includes(countryLabel)
        );
        targetLine = countryMatched || blankTolLines[0];
      } else {
        targetLine = blankTolLines[0];
      }
    }

    const sumAll = groupTxs.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const roundedAll = Math.round((sumAll + Number.EPSILON) * 100) / 100;

    let invoiceLineId: string | null = targetLine?.id ?? null;

    if (!invoiceLineId) {
      // Create new invoice line
      // Use the country from the group key (already determined above)
      let countryLabelForDescription = '';
      if (country === 'BE') countryLabelForDescription = 'België';
      else if (country === 'DE') countryLabelForDescription = 'Duitsland';
      else if (country === 'FR') countryLabelForDescription = 'Frankrijk';

      const description = countryLabelForDescription
        ? `${weekday} ${dateLabel}\nTol ${countryLabelForDescription}`
        : `${weekday} ${dateLabel}\nTol`;

      const { data: created, error: insErr } = await admin
        .from('invoice_lines')
        .insert([{
          invoice_id: invoiceId,
          quantity: 1,
          description,
          unit_price: roundedAll,
          vat_rate: vatRate,
          total: roundedAll
        }])
        .select('id')
        .single();
      if (insErr) throw insErr;
      invoiceLineId = created.id;
      updatedInvoiceLines += 1;
    } else {
      // Update existing line
      const { error: lineErr } = await admin
        .from('invoice_lines')
        .update({
          quantity: 1,
          unit_price: roundedAll,
          total: roundedAll,
          vat_rate: vatRate,
        })
        .eq('id', invoiceLineId);
      if (lineErr) throw lineErr;
      updatedInvoiceLines += 1;
    }

    const { error: txErr } = await admin
      .from('toll_transactions')
      .update({ invoice_line_id: invoiceLineId, status: 'matched' })
      .in('id', groupTxs.map((t) => t.id));
    if (txErr) throw txErr;
    matchedTransactions += groupTxs.length;
  }

  return {
    matchedTransactions,
    updatedInvoiceLines,
    message: `${matchedTransactions} toltransactie(s) gekoppeld aan ${updatedInvoiceLines} factuurregel(s)`
  };
}

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

  // Group new transactions by plate+date+country+vat_rate to separate different VAT rates and countries
  // This ensures we match on: kenteken, datum, land, VAT percentage
  const groups = new Map<string, Tx[]>();
  for (const tx of newTxs) {
    const vatRate = Number(tx.vat_rate ?? 21);
    const country = (tx.country || '').toUpperCase() || 'UNKNOWN';
    const key = `${dateKey(tx.license_plate, tx.transaction_date)}|${country}|${vatRate}`;
    const arr = groups.get(key) || [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const unmatchedGroups: ReconcileResult['unmatchedGroups'] = [];
  let matchedTransactions = 0;
  let updatedInvoiceLines = 0;

  for (const [key, groupTxs] of groups.entries()) {
    const parts = key.split('|');
    const plate = parts[0];
    const dateIso = parts[1];
    const country = parts[2];
    
    // Get VAT rate directly from the transactions in this group (not from the key)
    // All transactions in a group should have the same VAT rate since they're grouped by it
    const vatRates = groupTxs.map(tx => Number(tx.vat_rate ?? 21));
    const uniqueVatRates = Array.from(new Set(vatRates));
    if (uniqueVatRates.length !== 1) {
      console.warn(`Group has multiple VAT rates: ${uniqueVatRates.join(', ')}. Using first transaction's VAT rate.`);
    }
    const vatRate = uniqueVatRates[0] ?? 21; // Use first transaction's VAT rate, or 21 as fallback
    
    const { week, year } = dateToWeekYear(dateIso);
    const invoice = invoiceByPlateWeek.get(`${plate}|${year}|${week}`);
    if (!invoice) {
      unmatchedGroups.push({ license_plate: plate, transaction_date: dateIso, reason: 'Geen conceptfactuur gevonden (kenteken/week)' });
      continue;
    }

    const lines = await getInvoiceLines(invoice.id);
    const dateLabel = format(new Date(dateIso), 'dd-MM-yyyy', { locale: nl });
    
    // Determine country label for matching
    let countryLabel = '';
    if (country === 'BE') countryLabel = 'belgië';
    else if (country === 'DE') countryLabel = 'duitsland';
    else if (country === 'FR') countryLabel = 'frankrijk';
    
    // Filter tol lines by ALL criteria: kenteken (via invoice), tol, datum, land, VAT percentage
    const tolLines = lines.filter((l) => {
      const desc = String(l.description || '').toLowerCase();
      const lineVatRate = Number(l.vat_rate ?? 21);
      
      // Must contain "tol"
      if (!desc.includes('tol')) return false;
      
      // Must contain the date
      if (!desc.includes(dateLabel.toLowerCase())) return false;
      
      // Must have matching VAT rate
      if (lineVatRate !== vatRate) return false;
      
      // Must match country if country is known
      if (countryLabel && !desc.includes(countryLabel)) return false;
      
      return true;
    });
    
    if (tolLines.length === 0) {
      // Try blank placeholder lines as fallback (must match VAT rate)
      const blankTolLines = lines.filter((l) => {
        const desc = String(l.description || '').toLowerCase();
        const lineVatRate = Number(l.vat_rate ?? 21);
        return desc.includes('tol') && 
               desc.includes(dateLabel.toLowerCase()) &&
               lineVatRate === vatRate &&
               Number(l.unit_price) === 0 && 
               Number(l.quantity || 0) === 0;
      });
      
      if (blankTolLines.length === 0) {
        unmatchedGroups.push({ license_plate: plate, transaction_date: dateIso, reason: `Geen tol-factuurregel gevonden voor datum ${dateLabel}, land ${country}, VAT ${vatRate}%` });
        continue;
      }
      
      // Use blank placeholder line (will be updated with correct country and VAT rate)
      const sumAll = groupTxs.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const roundedAll = Math.round((sumAll + Number.EPSILON) * 100) / 100;
      const updates = [{ lineId: blankTolLines[0].id, amount: roundedAll, txIds: groupTxs.map((t) => t.id) }];
      
      for (const u of updates) {
        const txForUpdate = groupTxs.filter((t) => u.txIds.includes(t.id));
        const vatRates = txForUpdate.map((t) => Number((t as any).vat_rate ?? 21));
        const vatSet = new Set<number>(vatRates);
        const vatRateToSet = vatSet.size === 1 ? Array.from(vatSet)[0] : (vatRates[0] ?? 21);
        
        if (vatSet.size !== 1) {
          console.warn(`Multiple VAT rates in group: ${Array.from(vatSet).join(', ')}. Using ${vatRateToSet}%`);
        }

        const { error: lineErr } = await admin
          .from('invoice_lines')
          .update({
            quantity: 1,
            unit_price: u.amount,
            total: u.amount,
            vat_rate: vatRateToSet, // Always set VAT rate from transactions
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
      continue;
    }

    // Prefer updating a "blank" placeholder line first (unit_price=0 and quantity=0)
    const blankTolLines = tolLines.filter((l) => Number(l.unit_price) === 0 && Number(l.quantity || 0) === 0);
    const candidateLines = blankTolLines.length > 0 ? blankTolLines : tolLines;

    // Calculate sum for this group (should be all transactions for this plate+date+country+vat)
    const sumAll = groupTxs.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const roundedAll = Math.round((sumAll + Number.EPSILON) * 100) / 100;

    // Since we're already grouped by country+vat, we should have exactly one matching line
    const updates = [{ lineId: candidateLines[0].id, amount: roundedAll, txIds: groupTxs.map((t) => t.id) }];

    for (const u of updates) {
      // Determine VAT rate for this update - always use the VAT rate from transactions
      const txForUpdate = groupTxs.filter((t) => u.txIds.includes(t.id));
      const vatRates = txForUpdate.map((t) => Number((t as any).vat_rate ?? 21));
      const vatSet = new Set<number>(vatRates);
      const vatRateToSet = vatSet.size === 1 ? Array.from(vatSet)[0] : (vatRates[0] ?? 21);
      
      if (vatSet.size !== 1) {
        console.warn(`Multiple VAT rates in group: ${Array.from(vatSet).join(', ')}. Using ${vatRateToSet}%`);
      }

      const { error: lineErr } = await admin
        .from('invoice_lines')
        .update({
          quantity: 1,
          unit_price: u.amount,
          total: u.amount,
          vat_rate: vatRateToSet, // Always set VAT rate from transactions
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

  // Missing Toll: Find all concept invoices with blank toll placeholder lines (status "Tol toevoegen")
  // Use same logic as /api/admin/toll/concept-invoices
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

  // Find blank toll placeholder lines (same query as concept-invoices API)
  const chunkSize = 200;
  const invoicesWithOpenToll = new Set<string>();
  
  for (let i = 0; i < invoiceIds.length; i += chunkSize) {
    const chunk = invoiceIds.slice(i, i + chunkSize);
    const { data: lineRows, error: lErr } = await admin
      .from('invoice_lines')
      .select('invoice_id,quantity,unit_price,description')
      .in('invoice_id', chunk)
      .ilike('description', '%tol%')
      .eq('quantity', 0)
      .eq('unit_price', 0);
    if (lErr) throw lErr;
    
    (lineRows || []).forEach((r: any) => {
      if (!r?.invoice_id) return;
      invoicesWithOpenToll.add(r.invoice_id);
    });
  }

  // For each invoice with open toll placeholders, add entries to missingToll
  for (const invoiceId of invoicesWithOpenToll) {
    const invoice = invoicesById.get(invoiceId);
    if (!invoice) continue;
    
    const { plate, week, year } = parseInvoiceRef(invoice.reference);
    if (!plate || !week || !year) continue;

    // Get all blank toll lines for this invoice
    const { data: tollLines, error: linesErr } = await admin
      .from('invoice_lines')
      .select('id,invoice_id,description,quantity,unit_price')
      .eq('invoice_id', invoiceId)
      .ilike('description', '%tol%')
      .eq('quantity', 0)
      .eq('unit_price', 0);
    if (linesErr) throw linesErr;

    for (const line of (tollLines || []) as any[]) {
      const dateLabel = extractDateLabel(line.description);
      if (!dateLabel) {
        // No date label - add generic entry for this invoice
        missingToll.push({
          invoice_id: invoice.id,
          invoice_reference: invoice.reference,
          invoice_line_id: line.id,
          dateLabel: `Week ${week} - ${year}`,
          license_plate: plate,
        });
        continue;
      }
      
      const [dd, mm, yyyy] = dateLabel.split('-');
      const dateIso = `${yyyy}-${mm}-${dd}`;
      
      // Add to missingToll if no transactions exist for this date/plate
      // OR if transactions exist but are not yet matched to this invoice line
      const hasTransactions = txKeySet.has(dateKey(plate, dateIso));
      if (!hasTransactions) {
        missingToll.push({
          invoice_id: invoice.id,
          invoice_reference: invoice.reference,
          invoice_line_id: line.id,
          dateLabel,
          license_plate: plate,
        });
      } else {
        // Check if transactions are matched to this invoice line
        const matchedForThisLine = all.some(t => {
          if (t.status !== 'matched' || !t.invoice_line_id) return false;
          if (t.license_plate.toUpperCase() !== plate.toUpperCase()) return false;
          if (t.transaction_date !== dateIso) return false;
          return line.id === t.invoice_line_id;
        });
        // If transactions exist but are not matched to this line, show as missing
        if (!matchedForThisLine) {
          missingToll.push({
            invoice_id: invoice.id,
            invoice_reference: invoice.reference,
            invoice_line_id: line.id,
            dateLabel,
            license_plate: plate,
          });
        }
      }
    }
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Cache invoice lines per invoice for buildTollDashboard
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
    // Custom week calculation: Week 1 starts on first Monday of January
    const y = getCustomWeekYear(d);
    const w = String(getCustomWeek(d)).padStart(2, '0');
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
          'Geen conceptfactuur gevonden voor deze week/kenteken. Controleer of er een conceptfactuur is met kenmerk "Week XX - YYYY (KENTEKEN)".',
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
        ? 'Conceptfactuur gevonden, maar deze transacties zijn nog niet gekoppeld. Gebruik "Koppel aan factuur".'
        : `Conceptfactuur gevonden (${dateLabel}), maar er is geen tolregel (placeholder) voor deze datum. Gebruik "Koppel aan factuur" om automatisch een tolregel te laten aanmaken.`,
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
