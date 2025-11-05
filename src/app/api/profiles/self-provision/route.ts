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

    const { data: authUser, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authUser?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uid = authUser.user.id;
    const email = authUser.user.email ?? null;

    // 0) If a profile already exists for this id, respect existing data
    const { data: existingById } = await admin
      .from('profiles')
      .select('id,email')
      .eq('id', uid)
      .maybeSingle();
    if (existingById) {
      // Align email if it's missing/different, but do not touch role/names
      if (email && existingById.email !== email) {
        await admin.from('profiles').update({ email } as any).eq('id', uid);
      }
      return NextResponse.json({ ok: true });
    }

    // If a row already exists with the same email but different id,
    // migrate it to the correct id to avoid unique(email) conflicts.
    if (email) {
      const { data: existingByEmail } = await admin
        .from('profiles')
        .select('id, role, status')
        .eq('email', email)
        .maybeSingle();
      if (existingByEmail && existingByEmail.id !== uid) {
        // Migrate the row to the correct id without overwriting role/status
        const { error: updateErr } = await admin
          .from('profiles')
          .update({ id: uid } as any)
          .eq('email', email);
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
    }

    const payload = {
      id: uid,
      email,
      first_name: '',
      last_name: '',
      role: 'user',
      status: 'active',
    } as any;

    // Insert only if not exists; do NOT overwrite existing admins
    const { error } = await admin
      .from('profiles')
      .insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
