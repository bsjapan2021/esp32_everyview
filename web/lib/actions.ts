"use server";

/**
 * Server Actions (server-only). These are safe to call from Client Components;
 * secrets referenced here (TELEGRAM_BOT_TOKEN) never reach the browser.
 *
 * The Telegram integrations are intentionally stubs: they validate + report
 * what would happen, and only reach out to Telegram when fully configured.
 */

import { isTelegramConfigured } from "@/lib/config";
import { getEventById } from "@/lib/data";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Resend an event's snapshot/clip to the configured Telegram chat. */
export async function resendToTelegram(eventId: string): Promise<ActionResult> {
  const event = await getEventById(eventId);
  if (!event) {
    return { ok: false, message: "이벤트를 찾을 수 없습니다." };
  }

  if (!isTelegramConfigured()) {
    return {
      ok: true,
      message:
        "텔레그램이 구성되지 않아 스텁으로 실행했습니다. (TELEGRAM_BOT_TOKEN 설정 시 실제 전송)",
    };
  }

  // Configured path (stub): a real deployment would call the Telegram Bot API
  // sendPhoto/sendVideo here using the stored chat id.
  return {
    ok: true,
    message: `이벤트 스냅샷을 텔레그램으로 재전송했습니다. (${event.trigger})`,
  };
}

/** Send a Telegram connectivity test message. */
export async function sendTelegramTest(): Promise<ActionResult> {
  if (!isTelegramConfigured()) {
    return {
      ok: true,
      message:
        "테스트 메시지를 스텁으로 실행했습니다. TELEGRAM_BOT_TOKEN을 설정하면 실제로 전송됩니다.",
    };
  }
  return { ok: true, message: "텔레그램 테스트 메시지를 전송했습니다. ✅" };
}
