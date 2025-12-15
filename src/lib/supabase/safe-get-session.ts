import { supabase } from './client';
import type { Session } from '@supabase/supabase-js';

/**
 * Wraps supabase.auth.getSession() to gracefully handle invalid/expired
 * refresh tokens. When the refresh token is missing or rejected, we clear
 * local state and delete the auth cookie so the app can recover cleanly.
 */
export async function safeGetSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[auth] getSession returned error, clearing session:', error);
      await cleanupStaleSession();
      return null;
    }
    return data.session ?? null;
  } catch (err) {
    console.warn('[auth] getSession threw, clearing session:', err);
    await cleanupStaleSession();
    return null;
  }
}

async function cleanupStaleSession() {
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  try {
    await fetch('/api/auth/sync', { method: 'DELETE', keepalive: true });
  } catch {
    // ignore
  }
}

