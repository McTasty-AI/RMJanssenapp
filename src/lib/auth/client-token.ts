'use client';

import { supabase } from '@/lib/supabase/client';

/**
 * Get the current user's access token for API requests
 * 
 * @returns Promise<string | null> - The access token or null if not authenticated
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) {
      return null;
    }
    return session.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

/**
 * Get headers with Authorization token for API requests
 * 
 * @returns Promise<Headers> - Headers object with Authorization header if authenticated
 */
export async function getAuthHeaders(): Promise<Headers> {
  const headers = new Headers();
  const token = await getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

