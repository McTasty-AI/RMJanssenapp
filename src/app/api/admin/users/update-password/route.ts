import { NextRequest, NextResponse } from 'next/server';
import { validateAdminRequest } from '@/lib/auth/server-admin';

export async function POST(req: NextRequest) {
  try {
    const validation = await validateAdminRequest(req);
    if (!validation.valid) {
      return validation.response;
    }

    const { adminClient: admin } = validation;
    const { userId, password } = await req.json();

    if (!userId || typeof userId !== 'string' || !password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
