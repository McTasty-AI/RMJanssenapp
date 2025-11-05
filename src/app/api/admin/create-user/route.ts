import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const { email, password, firstName, lastName, role } = await req.json();

        if (!email || !password || !firstName || !lastName) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const adminClient = getAdminClient();

        // Verify caller is admin via bearer token
        const authHeader = req.headers.get('authorization') || '';
        const token = authHeader.toLowerCase().startsWith('bearer ')
          ? authHeader.slice(7)
          : undefined;
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { data: caller, error: callerErr } = await adminClient.auth.getUser(token);
        if (callerErr || !caller?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const callerId = caller.user.id;
        const { data: callerProfile } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', callerId)
            .maybeSingle();
        if (!callerProfile || callerProfile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // Create user in Supabase Auth
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });

        if (authError) {
            return NextResponse.json(
                { error: authError.message },
                { status: 400 }
            );
        }

        if (!authData.user) {
            return NextResponse.json(
                { error: 'Failed to create user' },
                { status: 500 }
            );
        }

        // Create profile in Supabase (allow creating admin if explicitly requested)
        const profileData = {
            id: authData.user.id,
            email,
            first_name: firstName,
            last_name: lastName,
            role: role === 'admin' ? 'admin' : 'user',
            status: 'active',
        };

        const { error: profileError } = await adminClient
            .from('profiles')
            .insert(profileData);

        if (profileError) {
            // Rollback: delete auth user if profile creation fails
            await adminClient.auth.admin.deleteUser(authData.user.id);
            return NextResponse.json(
                { error: profileError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            userId: authData.user.id,
        });

    } catch (error: any) {
        console.error('Error creating user:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create user' },
            { status: 500 }
        );
    }
}












