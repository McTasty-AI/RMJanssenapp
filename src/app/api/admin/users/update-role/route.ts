import { NextRequest, NextResponse } from 'next/server';
import { validateAdminRequest } from '@/lib/auth/server-admin';

export async function POST(req: NextRequest) {
  try {
    // Validate admin role
    const validation = await validateAdminRequest(req);
    if (!validation.valid) {
      return validation.response;
    }

    const { adminClient: admin } = validation;

    const { userId, role } = await req.json();
    if (!userId || (role !== 'admin' && role !== 'user')) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { error } = await admin.from('profiles').update({ role } as any).eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

