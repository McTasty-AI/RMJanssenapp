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
        .select('id,license_plate,transaction_date,amount,vat_rate,status,invoice_line_id')
        .in('id', ids);
      if (txErr) throw txErr;
      const rows = (txs || []) as any[];
      if (rows.length === 0) return NextResponse.json({ error: 'No transactions found' }, { status: 404 });

      const plates = new Set(rows.map((t) => String(t.license_plate || '').toUpperCase()));
      const dates = new Set(rows.map((t) => String(t.transaction_date || '')));
      if (plates.size !== 1 || dates.size !== 1) {
        return NextResponse.json({ error: 'Transactions must be from the same license_plate and transaction_date' }, { status: 400 });
      }
      const dateIso = Array.from(dates)[0];
      const dateLabel = format(new Date(dateIso), 'dd-MM-yyyy', { locale: nl });
      const weekday = format(new Date(dateIso), 'EEEE', { locale: nl });

      const sum = rows.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const total = Math.round((sum + Number.EPSILON) * 100) / 100;

      const vatSet = new Set(rows.map((t) => Number(t.vat_rate ?? 21)));
      const vatRateToSet = vatSet.size === 1 ? Array.from(vatSet)[0] : 21;

      const { data: lines, error: lineErr } = await adminClient
        .from('invoice_lines')
        .select('id,description,quantity,unit_price,vat_rate')
        .eq('invoice_id', invoiceId);
      if (lineErr) throw lineErr;

      const matchingTolLines = (lines || []).filter((l: any) => {
        const desc = String(l.description || '').toLowerCase();
        return desc.includes('tol') && desc.includes(dateLabel.toLowerCase());
      });
      const blankTolLines = matchingTolLines.filter((l: any) => Number(l.unit_price) === 0 && Number(l.quantity || 0) === 0);
      const target = (blankTolLines.length ? blankTolLines : matchingTolLines)[0] as any | undefined;

      let invoiceLineId: string | null = target?.id ?? null;
      if (!invoiceLineId) {
        if (!createIfMissing) {
          return NextResponse.json(
            { error: `No tol invoice line found for ${dateLabel} and createIfMissing=false` },
            { status: 400 }
          );
        }
        const description = `${weekday} ${dateLabel}\nTol`;
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

