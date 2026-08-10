/**
 * Centralized environment access.
 *
 * Naming rules (enforced by convention):
 *  - Only client-safe values use the NEXT_PUBLIC_ prefix.
 *  - Secrets (SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, INGEST_DEVICE_KEY_SALT)
 *    have NO prefix and are read only in server-side code.
 *
 * Nothing here throws at import time — pages/build must not crash when env is absent.
 */

/** Server-side env bundle (service role, telegram, salt + the public URL/anon for reuse). */
export function getServerEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    ingestDeviceKeySalt: process.env.INGEST_DEVICE_KEY_SALT ?? "",
  };
}

/** True when the server has enough to talk to Supabase with the service role. */
export function isSupabaseServerConfigured(): boolean {
  const { supabaseUrl, serviceRoleKey } = getServerEnv();
  return Boolean(supabaseUrl && serviceRoleKey);
}

/** True when the browser has enough to talk to Supabase with the anon key. */
export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/** Online threshold: a device is "online" if seen within this window. */
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
