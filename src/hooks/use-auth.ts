"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@/lib/types';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { mapSupabaseToApp } from '@/lib/utils';

// Cache voor profile data om snellere initial load te krijgen
const profileCache = new Map<string, { data: User; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minuten

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadingRef = useRef(false);

  const fallbackAllowed = process.env.NODE_ENV !== 'production';

  function buildFallbackUser(uid: string, email?: string | null): User {
    const name = (email || '')?.split('@')[0] || 'Gebruiker';
    return {
      uid,
      email: email || '',
      firstName: name,
      lastName: '',
      role: 'user',
      status: 'active',
    } as User;
  }

  async function withTimeout<T>(p: Promise<T>, ms = 8000, orValue: T | null = null): Promise<T | null> {
    return await new Promise<T | null>((resolve) => {
      const t = setTimeout(() => resolve(orValue), ms);
      p.then((v) => { clearTimeout(t); resolve(v); })
       .catch((_e) => { clearTimeout(t); resolve(orValue); });
    });
  }

  const loadUserProfile = useCallback(async (userId: string, token?: string) => {
    // Voorkom dubbele loads
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      // Check cache eerst voor snellere initial load
      const cached = profileCache.get(userId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setUser(cached.data);
        setIsLoaded(true);
        loadingRef.current = false;
        // Load fresh data in background
        loadUserProfileFresh(userId, token).catch(() => {});
        return;
      }

      // Als we geen token hebben, haal session op
      let sessionToken = token;
      if (!sessionToken) {
        const { data: sessionData } = await supabase.auth.getSession();
        sessionToken = sessionData?.session?.access_token;
      }

      // Parallel: profile ophalen EN sync call (niet blokkerend)
      const profilePromise = (async () => {
        const result = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        return result;
      })();

      const syncPromise = sessionToken 
        ? fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sessionToken}` },
            keepalive: true,
          }).catch(() => null) // Niet blokkerend - fail silently
        : Promise.resolve(null);

      // Wacht alleen op profile, sync gebeurt parallel
      const resp1 = await withTimeout<any>(
        profilePromise as Promise<any>,
        8000,
        { data: null }
      );
      // Sync gebeurt parallel en blokkeert niet - niet awaiten (al een catch op regel 80)

      const { data } = resp1 || { data: null };

      if (!data) {
        if (!sessionToken) {
          console.error('Error provisioning user profile: missing session');
          if (fallbackAllowed) {
            const { data: sessionData } = await supabase.auth.getSession();
            const fallback = buildFallbackUser(userId, sessionData?.session?.user?.email);
            setUser(fallback);
            profileCache.set(userId, { data: fallback, timestamp: Date.now() });
          } else {
            setUser(null);
          }
          setIsLoaded(true);
          loadingRef.current = false;
          return;
        }

        // Provision profile
        const resp = await withTimeout(
          fetch('/api/profiles/self-provision', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sessionToken}` },
          }),
          8000,
          null
        );

        if (!resp || !resp.ok) {
          if (fallbackAllowed) {
            const { data: s } = await supabase.auth.getSession();
            const fallback = buildFallbackUser(userId, s?.session?.user?.email);
            setUser(fallback);
            profileCache.set(userId, { data: fallback, timestamp: Date.now() });
          } else {
            setUser(null);
          }
          setIsLoaded(true);
          loadingRef.current = false;
          return;
        }

        // Direct na provisioning: haal profile op (parallel met sync)
        const profileAfterInsertPromise = (async () => {
          const result = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          return result;
        })();
        
        const profileAfterInsert = await withTimeout<any>(
          profileAfterInsertPromise as Promise<any>,
          8000,
          { data: null }
        );

        const { data: refetched } = profileAfterInsert || { data: null };
        const mappedAfterInsert = mapSupabaseToApp<User>(refetched || {});
        const finalUser = { uid: userId, ...mappedAfterInsert };
        setUser(finalUser);
        profileCache.set(userId, { data: finalUser, timestamp: Date.now() });
        setIsLoaded(true);
        loadingRef.current = false;
        return;
      }

      if (data) {
        const mappedData = mapSupabaseToApp<User>(data);
        if (mappedData.status === 'inactive') {
          await supabase.auth.signOut();
          setUser(null);
          setAuthUser(null);
          profileCache.delete(userId);
          setIsLoaded(true);
          loadingRef.current = false;
          return;
        }
        const finalUser = { uid: userId, ...mappedData };
        setUser(finalUser);
        profileCache.set(userId, { data: finalUser, timestamp: Date.now() });
      } else {
        setUser(null);
        profileCache.delete(userId);
      }
      setIsLoaded(true);
      loadingRef.current = false;
    } catch (error) {
      console.error("Error in loadUserProfile:", error);
      if (fallbackAllowed && authUser?.id) {
        const fallback = buildFallbackUser(authUser.id, authUser.email);
        setUser(fallback);
        profileCache.set(authUser.id, { data: fallback, timestamp: Date.now() });
      } else {
        setUser(null);
      }
      setIsLoaded(true);
      loadingRef.current = false;
    }
  }, [fallbackAllowed, authUser?.id, authUser?.email]);

  // Background refresh zonder UI te blokkeren
  const loadUserProfileFresh = useCallback(async (userId: string, token?: string) => {
    try {
      let sessionToken = token;
      if (!sessionToken) {
        const { data: sessionData } = await supabase.auth.getSession();
        sessionToken = sessionData?.session?.access_token;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        const mappedData = mapSupabaseToApp<User>(data);
        if (mappedData.status !== 'inactive') {
          const finalUser = { uid: userId, ...mappedData };
          setUser(finalUser);
          profileCache.set(userId, { data: finalUser, timestamp: Date.now() });
        }
      }
    } catch (error) {
      // Silent fail voor background refresh
      console.debug("Background profile refresh failed:", error);
    }
  }, []);

  // Global safety net: if for any reason auth/profile fetching stalls,
  // ensure the UI can recover instead of showing an infinite skeleton.
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => {
      console.warn('[auth] Safety timeout reached; proceeding without user.');
      setIsLoaded(true);
      loadingRef.current = false;
    }, 5000); // 5s fallback (verkort van 8s voor snellere UX)
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    setIsLoaded(false);
    loadingRef.current = false;
    
    // Prime cookie sync but do not decide UI yet; wait for INITIAL_SESSION event
    // Dit gebeurt parallel en blokkeert niet
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        const token = session?.access_token;
        await fetch('/api/auth/sync', {
          method: token ? 'POST' : 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          keepalive: true,
        });
      } catch {}
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          setAuthUser(session.user);
          // Geef token door voor parallelle processing
          await loadUserProfile(session.user.id, session.access_token);
        } else {
          setUser(null);
          setAuthUser(null);
          setIsLoaded(true);
        }
        return;
      }
      
      // Only treat explicit sign-out as a reset. Transient events should not kick the user out.
      if (event === 'SIGNED_OUT') {
        setAuthUser(null);
        setUser(null);
        profileCache.clear(); // Clear cache bij logout
        setIsLoaded(true);
        loadingRef.current = false;
        try { await fetch('/api/auth/sync', { method: 'DELETE', keepalive: true }); } catch {}
        return;
      }

      // Ignore TOKEN_REFRESHED events to prevent unnecessary reloads when tab becomes visible again
      // These events are triggered by Supabase's automatic token refresh on visibilitychange
      // and don't represent actual user changes
      if (event === 'TOKEN_REFRESHED') {
        // Silently update authUser reference without reloading profile
        if (session?.user) {
          setAuthUser(prev => {
            // Only update if user ID changed (shouldn't happen with TOKEN_REFRESHED, but safety check)
            if (prev?.id !== session.user.id) {
              return session.user;
            }
            return prev;
          });
        }
        return;
      }

      if (session?.user) {
        // Only reload profile if the user actually changed
        const currentUserId = authUser?.id;
        if (session.user.id !== currentUserId) {
          setAuthUser(session.user);
          // Sync gebeurt parallel in loadUserProfile
          await loadUserProfile(session.user.id, session.access_token);
        }
        // If user is the same, don't update state to prevent unnecessary re-renders
      }
      // For other events with no session, ignore to avoid flicker/redirect loops.
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  // Realtime update of role/status changes; refresh profile when the row changes
  useEffect(() => {
    if (!authUser?.id) return;
    const ch = supabase
      .channel(`profile-${authUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${authUser.id}` }, () => {
        // Clear cache bij realtime updates
        profileCache.delete(authUser.id);
        loadUserProfile(authUser.id);
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [authUser?.id, loadUserProfile]);

  /* moved helpers and loader to top */

  const signOut = async () => {
    await supabase.auth.signOut();
    try { await fetch('/api/auth/sync', { method: 'DELETE', keepalive: true }); } catch {}
    setUser(null);
    setAuthUser(null);
    profileCache.clear(); // Clear cache bij logout
    loadingRef.current = false;
  };

  return {
    user,
    authUser,
    isLoaded,
    signOut,
  };
};
