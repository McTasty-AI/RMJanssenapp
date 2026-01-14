import { NextRequest, NextResponse } from 'next/server';
import { validateAuthenticatedRequest } from '@/lib/auth/server-auth';
import { reconcileNewTollTransactions } from '@/lib/toll/reconcile';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export const runtime = 'nodejs';

async function assertAdmin(adminClient: any, userId: string) {
  const { data, error } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data || data.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  try {
    const validation = await validateAuthenticatedRequest(req);
    if (!validation.valid) return validation.response;
    const { adminClient, userId } = validation;

    const forbidden = await assertAdmin(adminClient, userId);
    if (forbidden) return forbidden;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    if (action === 'setStatus') {
      const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
      const status = String(body?.status || '');
      if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
      if (!['new', 'matched', 'ignored'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }

      const patch: any = { status };
      // If ignored, also clear link so it doesn't show as matched
      if (status !== 'matched') patch.invoice_line_id = null;

      const { error } = await adminClient.from('toll_transactions').update(patch).in('id', ids);
      if (error) throw error;
      return NextResponse.json({ ok: true, updated: ids.length });
    }

    if (action === 'reconcile') {
      const reconcile = await reconcileNewTollTransactions(adminClient);
      return NextResponse.json({ ok: true, reconcile });
    }

    if (action === 'matchManual') {
      const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
      const invoiceId = String(body?.invoiceId || '');
      const createIfMissing = body?.createIfMissing !== false;
      if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
      if (!invoiceId) return NextResponse.json({ error: 'No invoiceId provided' }, { status: 400 });

      const { data: invoice, error: invErr } = await adminClient
        .from('invoices')
        .select('id,status,reference')
        .eq('id', invoiceId)
        .maybeSingle();
      if (invErr) throw invErr;
      if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      if (invoice.status !== 'concept') {
        return NextResponse.json({ error: 'Only concept invoices can be matched' }, { status: 400 });
      }

      const { data: txs, error: txErr } = await adminClient
        .from('toll_transactions')
        .select('id,license_plate,transaction_date,amount,vat_rate,country,status,invoice_line_id')
        .in('id', ids);
      if (txErr) throw txErr;
      const rows = (txs || []) as any[];
      if (rows.length === 0) return NextResponse.json({ error: 'No transactions found' }, { status: 404 });

      const plates = new Set(rows.map((t) => String(t.license_plate || '').toUpperCase()));
      const dates = new Set(rows.map((t) => String(t.transaction_date || '')));
      const vatRates = new Set(rows.map((t) => Number(t.vat_rate ?? 21)));
      if (plates.size !== 1 || dates.size !== 1) {
        return NextResponse.json({ error: 'Transactions must be from the same license_plate and transaction_date' }, { status: 400 });
      }
      if (vatRates.size !== 1) {
        return NextResponse.json({ error: 'Transactions must have the same VAT rate. Group transactions with different VAT rates separately.' }, { status: 400 });
      }
      const dateIso = Array.from(dates)[0];
      const dateLabel = format(new Date(dateIso), 'dd-MM-yyyy', { locale: nl });
      const weekday = format(new Date(dateIso), 'EEEE', { locale: nl });
      const vatRateToSet = Array.from(vatRates)[0];

      const sum = rows.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const total = Math.round((sum + Number.EPSILON) * 100) / 100;

      // Determine country for description (prefer most common country in group)
      const countryCounts = new Map<string, number>();
      for (const tx of rows) {
        const c = String(tx.country || '').toUpperCase() || 'UNKNOWN';
        countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
      }
      const mostCommonCountry = Array.from(countryCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNKNOWN';

      const { data: lines, error: lineErr } = await adminClient
        .from('invoice_lines')
        .select('id,description,quantity,unit_price,vat_rate')
        .eq('invoice_id', invoiceId);
      if (lineErr) throw lineErr;

      // Determine country label for matching
      let countryLabel = '';
      if (mostCommonCountry === 'BE') countryLabel = 'belgië';
      else if (mostCommonCountry === 'DE') countryLabel = 'duitsland';
      else if (mostCommonCountry === 'FR') countryLabel = 'frankrijk';

      // Filter tol lines by ALL criteria: kenteken (via invoice), tol, datum, land, VAT percentage
      // Note: kenteken and week are already verified via invoice reference
      const matchingTolLines = (lines || []).filter((l: any) => {
        const desc = String(l.description || '').toLowerCase();
        const lineVatRate = Number(l.vat_rate ?? 21);
        
        // Must contain "tol"
        if (!desc.includes('tol')) return false;
        
        // Must contain the date
        if (!desc.includes(dateLabel.toLowerCase())) return false;
        
        // Must have matching VAT rate
        if (lineVatRate !== vatRateToSet) return false;
        
        // Must match country if country is known
        if (countryLabel && !desc.includes(countryLabel)) return false;
        
        return true;
      });
      
      // If no line exists for this VAT rate + country combination, look for blank placeholder lines
      // Blank lines should still match on: tol, datum, and optionally country
      const blankTolLines = (lines || []).filter((l: any) => {
        const desc = String(l.description || '').toLowerCase();
        
        // Must contain "tol"
        if (!desc.includes('tol')) return false;
        
        // Must contain the date
        if (!desc.includes(dateLabel.toLowerCase())) return false;
        
        // Must be blank (quantity=0 and unit_price=0)
        if (Number(l.unit_price) !== 0 || Number(l.quantity || 0) !== 0) return false;
        
        return true;
      });
      
      let targetLine: any | undefined;
      if (matchingTolLines.length > 0) {
        // Prefer blank placeholder lines with matching VAT rate and country
        const blankWithVatAndCountry = matchingTolLines.filter((l: any) => 
          Number(l.unit_price) === 0 && Number(l.quantity || 0) === 0
        );
        if (blankWithVatAndCountry.length > 0) {
          targetLine = blankWithVatAndCountry[0];
        } else {
          // Use first matching line (should be unique based on all criteria)
          targetLine = matchingTolLines[0];
        }
      } else if (blankTolLines.length > 0) {
        // If no exact match, use blank placeholder line
        // Prefer one that matches country if available
        if (countryLabel) {
          const countryMatched = blankTolLines.find((l: any) => 
            String(l.description).toLowerCase().includes(countryLabel)
          );
          targetLine = countryMatched || blankTolLines[0];
        } else {
          targetLine = blankTolLines[0];
        }
      }

      let invoiceLineId: string | null = targetLine?.id ?? null;
      if (!invoiceLineId) {
        if (!createIfMissing) {
          return NextResponse.json(
            { error: `No tol invoice line found for ${dateLabel} with VAT rate ${vatRateToSet}% and createIfMissing=false` },
            { status: 400 }
          );
        }
        // Create new invoice line with appropriate description and VAT rate
        let countryLabel = '';
        if (mostCommonCountry === 'BE') countryLabel = 'België';
        else if (mostCommonCountry === 'DE') countryLabel = 'Duitsland';
        else if (mostCommonCountry === 'FR') countryLabel = 'Frankrijk';
        
        const description = countryLabel 
          ? `${weekday} ${dateLabel}\nTol ${countryLabel}`
          : `${weekday} ${dateLabel}\nTol`;
        
        const { data: created, error: insErr } = await adminClient
          .from('invoice_lines')
          .insert([{ invoice_id: invoiceId, quantity: 1, description, unit_price: total, vat_rate: vatRateToSet, total }])
          .select('id')
          .single();
        if (insErr) throw insErr;
        invoiceLineId = created.id;
      } else {
        const { error: upErr } = await adminClient
          .from('invoice_lines')
          .update({ quantity: 1, unit_price: total, total, vat_rate: vatRateToSet })
          .eq('id', invoiceLineId);
        if (upErr) throw upErr;
      }

      const { error: txUpErr } = await adminClient
        .from('toll_transactions')
        .update({ invoice_line_id: invoiceLineId, status: 'matched' })
        .in('id', ids);
      if (txUpErr) throw txUpErr;

      // Recompute "tol status" for this invoice: if no blank toll lines remain => Tol toegevoegd
      const { data: stillOpen, error: openErr } = await adminClient
        .from('invoice_lines')
        .select('id')
        .eq('invoice_id', invoiceId)
        .eq('quantity', 0)
        .eq('unit_price', 0)
        .ilike('description', '%tol%')
        .limit(1);
      if (openErr) throw openErr;
      const toll_status = (stillOpen || []).length > 0 ? 'Tol toevoegen' : 'Tol toegevoegd';

      return NextResponse.json({
        ok: true,
        invoiceLineId,
        total,
        vat_rate: vatRateToSet,
        invoice_reference: invoice.reference ?? null,
        toll_status,
      });
    }

    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 });
  } catch (error: any) {
    console.error('[TOLL TX PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Mislukt', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

