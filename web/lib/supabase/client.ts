/**
 * Browser Supabase client using the public URL + ANON key.
 * Safe to import from Client Components. Returns null when unconfigured so
 * callers can render an "unconfigured" state instead of crashing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseBrowserConfigured } from "@/lib/config";

let cached: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (!cached) {
    cached = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return cached;
}

export { isSupabaseBrowserConfigured };
