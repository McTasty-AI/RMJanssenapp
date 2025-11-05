import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Public server client (uses anon key). Good for SSR reads under RLS.
export function getServerClient(): SupabaseClient {
  return createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Admin client (service role). Only use in trusted server code (never ship to client).
export function getAdminClient(): SupabaseClient {
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url!, service!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'rmj-admin' } },
  });
}

