import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Senza queste due variabili l'app funziona in "modo locale": i dati restano nel browser. */
export const hasSupabase = Boolean(url && key);

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, key as string, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
