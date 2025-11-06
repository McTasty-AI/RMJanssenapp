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

    const body = await req.json();
    const userId: string | undefined = body.userId;
    const email: string | null = body.email ?? null;
    const firstName: string | null = body.firstName ?? null;
    const lastName: string | null = body.lastName ?? null;
    const role: string | null = body.role ?? 'user';
    const status: string | null = body.status ?? 'active';

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const payload = {
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      status,
    } as any;

    const { error } = await admin
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

