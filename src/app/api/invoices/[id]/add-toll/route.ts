import { NextRequest, NextResponse } from 'next/server';
import { validateAuthenticatedRequest } from '@/lib/auth/server-auth';
import { addTollToInvoice } from '@/lib/toll/reconcile';

export const runtime = 'nodejs';

async function assertAdmin(adminClient: any, userId: string) {
  const { data, error } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data || data.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const validation = await validateAuthenticatedRequest(req);
    if (!validation.valid) return validation.response;
    const { adminClient, userId } = validation;

    const forbidden = await assertAdmin(adminClient, userId);
    if (forbidden) return forbidden;

    const { id: invoiceId } = await params;
    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const result = await addTollToInvoice(adminClient, invoiceId);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[ADD TOLL TO INVOICE] Error:', error);
    return NextResponse.json(
      { error: 'Tol toevoegen mislukt', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
