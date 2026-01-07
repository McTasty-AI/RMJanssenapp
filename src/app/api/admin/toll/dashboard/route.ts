import { NextRequest, NextResponse } from 'next/server';
import { validateAuthenticatedRequest } from '@/lib/auth/server-auth';
import { buildTollDashboard } from '@/lib/toll/reconcile';

export const runtime = 'nodejs';

async function assertAdmin(adminClient: any, userId: string) {
  const { data, error } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data || data.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const validation = await validateAuthenticatedRequest(req);
    if (!validation.valid) return validation.response;
    const { adminClient, userId } = validation;

    const forbidden = await assertAdmin(adminClient, userId);
    if (forbidden) return forbidden;

    const url = new URL(req.url);
    const daysBack = Number(url.searchParams.get('daysBack') || 120);
    const dashboard = await buildTollDashboard(adminClient, { daysBack: Number.isFinite(daysBack) ? daysBack : 120 });
    return NextResponse.json(dashboard);
  } catch (error: any) {
    console.error('[TOLL DASHBOARD] Error:', error);
    return NextResponse.json(
      { error: 'Dashboard laden mislukt', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

