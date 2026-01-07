import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '~/lib/supabase';

type SupabaseContextValue = {
  supabase: typeof supabase;
  session: Session | null;
  loading: boolean;
};

export const SupabaseContext = createContext<SupabaseContextValue | undefined>(undefined);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      supabase,
      session,
      loading,
    }),
    [session, loading]
  );

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}






