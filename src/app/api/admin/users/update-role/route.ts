import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7)
      : undefined;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify caller is admin
    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const callerId = caller.user.id;
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', callerId).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

