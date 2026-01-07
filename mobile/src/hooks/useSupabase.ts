import { useContext } from 'react';
import { SupabaseContext } from '~/providers/SupabaseProvider';

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error('useSupabase must be used inside SupabaseProvider');
  return ctx;
}






