import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(req: NextRequest) {
  const { pathname, origin, search } = req.nextUrl;

  // Protect /admin page routes and /api/admin API routes
  const isAdminPage = pathname.startsWith('/admin');
  const isAdminApi = pathname.startsWith('/api/admin');
  
  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  // If env is missing, do not block to avoid lockout in dev
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return NextResponse.next();
  }

  const token = req.cookies.get('rmj_at')?.value;
  if (!token) {
    const url = new URL(`/login`, origin);
    if (pathname) url.searchParams.set('next', `${pathname}${search || ''}`);
    return NextResponse.redirect(url);
  }

  try {
    // Validate token -> get user id
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!uRes.ok) {
      const url = new URL(`/login`, origin);
      url.searchParams.set('next', `${pathname}${search || ''}`);
      return NextResponse.redirect(url);
    }
    const uData: any = await uRes.json();
    const uid = uData?.id;
    if (!uid) {
      const url = new URL(`/login`, origin);
      url.searchParams.set('next', `${pathname}${search || ''}`);
      return NextResponse.redirect(url);
    }

    // Ask for profile role (RLS will allow self read)
    const pRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(uid)}`,
      {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!pRes.ok) return NextResponse.redirect(new URL('/dashboard', origin));
    const rows: any[] = await pRes.json();
    const role = rows?.[0]?.role;
    if (role !== 'admin') {
      // For API routes, return 403 JSON response
      if (isAdminApi) {
        return NextResponse.json(
          { error: 'Forbidden: Admin role required' },
          { status: 403 }
        );
      }
      // For page routes, redirect to dashboard
      return NextResponse.redirect(new URL('/dashboard', origin));
    }
  } catch {
    // For API routes, return 401 JSON response
    if (isAdminApi) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    // For page routes, redirect to login
    return NextResponse.redirect(new URL('/login', origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
