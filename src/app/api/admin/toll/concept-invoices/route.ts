import { NextRequest, NextResponse } from 'next/server';
import { validateAuthenticatedRequest } from '@/lib/auth/server-auth';

export const runtime = 'nodejs';

async function assertAdmin(adminClient: any, userId: string) {
  const { data, error } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data || data.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * Returns concept invoices with computed toll status:
 * - toll_status = 'Tol toevoegen' if there are blank toll placeholder lines (description ilike '%tol%' AND quantity=0 AND unit_price=0)
 * - toll_status = 'Tol toegevoegd' otherwise
 *
 * Query params:
 * - needsToll=1 (default): only return invoices with open toll placeholders
 * - needsToll=0: return all concept invoices (with computed toll_status)
 */
export async function GET(req: NextRequest) {
  try {
    const validation = await validateAuthenticatedRequest(req);
    if (!validation.valid) return validation.response;
    const { adminClient, userId } = validation;

    const forbidden = await assertAdmin(adminClient, userId);
    if (forbidden) return forbidden;

    const url = new URL(req.url);
    const onlyNeedsToll = (url.searchParams.get('needsToll') || '1') !== '0';
    const limit = Math.min(500, Number(url.searchParams.get('limit') || 300));

    // Find blank toll placeholder lines and count per invoice
    const { data: lineRows, error: lineErr } = await adminClient
      .from('invoice_lines')
      .select('invoice_id,quantity,unit_price,description')
      .eq('quantity', 0)
      .eq('unit_price', 0)
      .ilike('description', '%tol%')
      .limit(10000);
    if (lineErr) throw lineErr;

    const openCountByInvoiceId = new Map<string, number>();
    (lineRows || []).forEach((r: any) => {
      if (!r?.invoice_id) return;
      openCountByInvoiceId.set(r.invoice_id, (openCountByInvoiceId.get(r.invoice_id) || 0) + 1);
    });

    const { data: invoices, error: invErr } = await adminClient
      .from('invoices')
      .select('id,reference,invoice_date,status')
      .eq('status', 'concept')
      .order('invoice_date', { ascending: false })
      .limit(limit);
    if (invErr) throw invErr;

    const enriched = (invoices || [])
      .map((inv: any) => {
        const open_toll_lines = openCountByInvoiceId.get(inv.id) || 0;
        const toll_status = open_toll_lines > 0 ? 'Tol toevoegen' : 'Tol toegevoegd';
        return { ...inv, open_toll_lines, toll_status };
      })
      .filter((inv: any) => (onlyNeedsToll ? inv.open_toll_lines > 0 : true));

    return NextResponse.json({ invoices: enriched });
  } catch (error: any) {
    console.error('[TOLL CONCEPT INVOICES] Error:', error);
    return NextResponse.json(
      { error: 'Ophalen mislukt', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

