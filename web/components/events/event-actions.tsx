"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Trash2, Send, Loader2 } from "lucide-react";
import { resendToTelegram } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function EventActions({
  eventId,
  initialProtected,
}: {
  eventId: string;
  initialProtected: boolean;
}) {
  const router = useRouter();
  const [isProtected, setIsProtected] = useState(initialProtected);
  const [busy, setBusy] = useState<null | "protect" | "delete" | "telegram">(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  }

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function toggleProtect() {
    const next = !isProtected;
    setBusy("protect");
    setIsProtected(next);
    const ok = await patch({ protected: next });
    setBusy(null);
    if (!ok) {
      setIsProtected(!next);
      flash("변경에 실패했습니다.");
    } else {
      flash(next ? "이벤트를 보호했습니다." : "보호를 해제했습니다.");
    }
  }

  async function remove() {
    if (isProtected) {
      flash("보호된 이벤트는 삭제할 수 없습니다.");
      return;
    }
    if (!window.confirm("이 이벤트를 삭제하시겠습니까?")) return;
    setBusy("delete");
    const ok = await patch({ deleted: true });
    setBusy(null);
    if (ok) {
      startTransition(() => router.push("/events"));
    } else {
      flash("삭제에 실패했습니다.");
    }
  }

  function resend() {
    setBusy("telegram");
    startTransition(async () => {
      const result = await resendToTelegram(eventId);
      setBusy(null);
      flash(result.message);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={toggleProtect}
        disabled={busy === "protect"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50",
          isProtected
            ? "border-warning/40 bg-warning/15 text-warning"
            : "border-border bg-muted hover:bg-muted/70",
        )}
      >
        {busy === "protect" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : isProtected ? (
          <Lock className="h-4 w-4" aria-hidden />
        ) : (
          <Unlock className="h-4 w-4" aria-hidden />
        )}
        {isProtected ? "보호됨" : "보호"}
      </button>

      <button
        type="button"
        onClick={resend}
        disabled={busy === "telegram"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70 disabled:opacity-50"
      >
        {busy === "telegram" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="h-4 w-4" aria-hidden />
        )}
        텔레그램 재전송
      </button>

      <button
        type="button"
        onClick={remove}
        disabled={busy === "delete" || isProtected}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        {busy === "delete" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="h-4 w-4" aria-hidden />
        )}
        삭제
      </button>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg md:bottom-8"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
