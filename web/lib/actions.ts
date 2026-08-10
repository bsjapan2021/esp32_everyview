"use server";

/**
 * Server Actions (server-only). Safe to call from Client Components:
 * the secrets read here (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) come from
 * process.env and never reach the browser bundle. No secret is hard-coded —
 * set them as encrypted environment variables in your host (e.g. Vercel).
 */

import { getServerEnv, isTelegramSendable } from "@/lib/config";
import { getEventById } from "@/lib/data";

export interface ActionResult {
  ok: boolean;
  message: string;
}

interface TgResponse {
  ok: boolean;
  description?: string;
  result?: { username?: string };
}

/** Call the Telegram Bot API server-side. Token stays on the server. */
async function tgApi(
  method: string,
  body: Record<string, unknown>,
): Promise<TgResponse> {
  const { telegramBotToken } = getServerEnv();
  const res = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  return (await res.json()) as TgResponse;
}

const NOT_CONFIGURED =
  "텔레그램 미구성: 서버 환경변수 TELEGRAM_BOT_TOKEN 과 TELEGRAM_CHAT_ID 를 설정하세요.";

/** Resend an event's snapshot to the configured Telegram chat. */
export async function resendToTelegram(eventId: string): Promise<ActionResult> {
  const event = await getEventById(eventId);
  if (!event) {
    return { ok: false, message: "이벤트를 찾을 수 없습니다." };
  }
  if (!isTelegramSendable()) {
    return { ok: false, message: NOT_CONFIGURED };
  }

  const { telegramChatId } = getServerEnv();
  const caption =
    `🔁 이벤트 재전송\n🕒 ${event.detected_at}\n🎯 트리거: ${event.trigger}` +
    (event.score != null ? ` (점수 ${event.score}%)` : "");

  try {
    const r = event.snapshot_url
      ? await tgApi("sendPhoto", {
          chat_id: telegramChatId,
          photo: event.snapshot_url,
          caption,
        })
      : await tgApi("sendMessage", { chat_id: telegramChatId, text: caption });

    return r.ok
      ? { ok: true, message: "텔레그램으로 재전송했습니다. ✅" }
      : { ok: false, message: `전송 실패: ${r.description ?? "알 수 없는 오류"}` };
  } catch (e) {
    return {
      ok: false,
      message: `전송 오류: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Send a Telegram connectivity test message. */
export async function sendTelegramTest(): Promise<ActionResult> {
  if (!isTelegramSendable()) {
    return { ok: false, message: NOT_CONFIGURED };
  }
  try {
    const { telegramChatId } = getServerEnv();
    const r = await tgApi("sendMessage", {
      chat_id: telegramChatId,
      parse_mode: "HTML",
      text: "✅ <b>ESP32CAM-Guard</b> 대시보드 연결 테스트 메시지",
    });
    return r.ok
      ? { ok: true, message: "텔레그램 테스트 메시지를 전송했습니다. ✅" }
      : {
          ok: false,
          message: `전송 실패: ${r.description ?? "chat_id/토큰을 확인하세요"}`,
        };
  } catch (e) {
    return {
      ok: false,
      message: `전송 오류: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
