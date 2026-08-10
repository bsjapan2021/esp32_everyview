"use client";

import { useEffect, useRef, useState } from "react";
import {
  HardDriveDownload,
  CheckCircle2,
  Loader2,
  Sparkles,
  Package,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { formatDateKST } from "@/lib/time";

interface Release {
  version: string;
  date: string; // ISO
  notes: string[];
  mandatory?: boolean;
}

const CURRENT = "1.4.2";

const RELEASES: Release[] = [
  {
    version: "1.5.0",
    date: "2026-08-08T00:00:00+09:00",
    mandatory: true,
    notes: [
      "야간 모드 노이즈 감소 및 자동 게인 개선",
      "PIR + 모션 동시 트리거 정확도 향상",
      "하트비트에 여유 힙(free heap) 리포트 추가",
      "드물게 발생하던 SD 카드 마운트 실패 수정",
    ],
  },
  {
    version: "1.4.2",
    date: "2026-07-21T00:00:00+09:00",
    notes: ["NTP 시간 동기화 안정화", "스트림 재연결 로직 개선"],
  },
  {
    version: "1.4.0",
    date: "2026-06-30T00:00:00+09:00",
    notes: ["감지 영역 마스크(8×6) 지원", "텔레그램 알림 추가"],
  },
];

type Phase = "idle" | "updating" | "done";

export function OtaClient() {
  const latest = RELEASES[0];
  const upToDate = CURRENT === latest.version;

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function startUpdate() {
    if (phase === "updating") return;
    setPhase("updating");
    setProgress(0);
    timer.current = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(100, p + Math.random() * 12 + 4);
        if (next >= 100) {
          if (timer.current) clearInterval(timer.current);
          setPhase("done");
          return 100;
        }
        return next;
      });
    }, 350);
  }

  return (
    <div className="space-y-6">
      {/* Version status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">현재 펌웨어</p>
          <p className="mt-1 font-mono text-2xl font-bold">{CURRENT}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">최신 펌웨어</p>
            {latest.mandatory ? <Badge tone="danger">필수</Badge> : null}
          </div>
          <p className="mt-1 flex items-center gap-2 font-mono text-2xl font-bold">
            {latest.version}
            {!upToDate ? (
              <Sparkles className="h-5 w-5 text-accent" aria-hidden />
            ) : null}
          </p>
        </Card>
      </div>

      {/* Update panel */}
      <Card className="p-4">
        {upToDate ? (
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium">
              최신 펌웨어를 사용 중입니다.
            </span>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-base font-semibold">
                  <HardDriveDownload className="h-4 w-4" aria-hidden />
                  {latest.version} 업데이트 사용 가능
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateKST(latest.date)} 릴리스
                </p>
              </div>
              <button
                type="button"
                onClick={startUpdate}
                disabled={phase === "updating" || phase === "done"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {phase === "updating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <HardDriveDownload className="h-4 w-4" aria-hidden />
                )}
                {phase === "done"
                  ? "설치 완료"
                  : phase === "updating"
                    ? "설치 중…"
                    : "업데이트 설치"}
              </button>
            </div>

            <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-muted-foreground">
              {latest.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>

            {phase !== "idle" ? (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {phase === "done" ? "완료" : "펌웨어 전송 중"}
                  </span>
                  <span className="font-mono tabular-nums">
                    {Math.round(progress)}%
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {phase === "done" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {latest.version} 설치가 완료되었습니다. 디바이스가
                    재부팅됩니다.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </Card>

      {/* History */}
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Package className="h-4 w-4" aria-hidden /> 릴리스 이력
        </h2>
        <ol className="space-y-4">
          {RELEASES.map((r) => (
            <li key={r.version} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 h-3 w-3 rounded-full ${
                    r.version === CURRENT ? "bg-success" : "bg-border"
                  }`}
                />
                <span className="mt-1 w-px flex-1 bg-border" />
              </div>
              <div className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{r.version}</span>
                  {r.version === CURRENT ? (
                    <Badge tone="success">현재</Badge>
                  ) : null}
                  {r.mandatory ? <Badge tone="danger">필수</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {formatDateKST(r.date)}
                  </span>
                </div>
                <ul className="mt-1 ml-4 list-disc space-y-0.5 text-sm text-muted-foreground">
                  {r.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
