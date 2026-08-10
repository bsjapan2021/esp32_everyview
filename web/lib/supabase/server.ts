/**
 * Server-only Supabase client using the SERVICE ROLE key.
 *
 * IMPORTANT:
 *  - Never import this module into a Client Component / browser bundle.
 *  - It is created lazily; importing this file does nothing. It only throws
 *    when actually called at request time AND env is missing, so the app
 *    builds and runs (with mock data) without real credentials.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, isSupabaseServerConfigured } from "@/lib/config";

let cached: SupabaseClient | null = null;

/**
 * Get the service-role Supabase client. Throws only when invoked without
 * configuration — callers should guard with {@link isSupabaseServerConfigured}
 * and fall back to mock data when it returns false.
 */
export function getServiceClient(): SupabaseClient {
  const { supabaseUrl, serviceRoleKey } = getServerEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase service client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!cached) {
    cached = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export { isSupabaseServerConfigured };
