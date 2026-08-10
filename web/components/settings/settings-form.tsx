"use client";

import { useEffect, useState, useTransition } from "react";
import { Save, RotateCcw, Send, Loader2 } from "lucide-react";
import { Card } from "@/components/ui";
import { MaskGrid, MASK_CELLS, maskToHex } from "@/components/settings/mask-grid";
import { sendTelegramTest } from "@/lib/actions";

interface Settings {
  sensitivity: number; // 1..10
  cooldownSec: number;
  clipLenSec: number;
  storageThresholdPct: number;
  scheduleEnabled: boolean;
  scheduleStart: string; // HH:MM
  scheduleEnd: string; // HH:MM
  mask: boolean[];
}

const DEFAULTS: Settings = {
  sensitivity: 6,
  cooldownSec: 30,
  clipLenSec: 10,
  storageThresholdPct: 85,
  scheduleEnabled: true,
  scheduleStart: "18:00",
  scheduleEnd: "07:00",
  mask: new Array(MASK_CELLS).fill(true),
};

const STORAGE_KEY = "guard-settings";

export function SettingsForm() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [testing, startTest] = useTransition();

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<Settings>;
        setSettings({
          ...DEFAULTS,
          ...parsed,
          mask:
            Array.isArray(parsed.mask) && parsed.mask.length === MASK_CELLS
              ? parsed.mask
              : DEFAULTS.mask,
        });
      } catch {
        /* ignore */
      }
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(new Date().toISOString());
      setToast("설정을 저장했습니다. (다음 하트비트에 디바이스로 전달)");
    } catch {
      setToast("저장에 실패했습니다.");
    }
  }

  function reset() {
    setSettings(DEFAULTS);
    setToast("기본값으로 초기화했습니다. 저장하려면 저장 버튼을 누르세요.");
  }

  function testTelegram() {
    startTest(async () => {
      const r = await sendTelegramTest();
      setToast(r.message);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Detection */}
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
          모션 감지
        </h2>

        <div className="mb-5">
          <div className="mb-1 flex items-center justify-between text-sm">
            <label htmlFor="sensitivity">모션 감도</label>
            <span className="font-mono font-semibold tabular-nums">
              {settings.sensitivity} / 10
            </span>
          </div>
          <input
            id="sensitivity"
            type="range"
            min={1}
            max={10}
            step={1}
            value={settings.sensitivity}
            onChange={(e) => update("sensitivity", Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>둔감</span>
            <span>민감</span>
          </div>
        </div>

        <NumberField
          id="cooldown"
          label="재촬영 대기 (쿨다운)"
          suffix="초"
          min={5}
          max={600}
          step={5}
          value={settings.cooldownSec}
          onChange={(v) => update("cooldownSec", v)}
        />
        <NumberField
          id="cliplen"
          label="클립 길이"
          suffix="초"
          min={3}
          max={60}
          step={1}
          value={settings.clipLenSec}
          onChange={(v) => update("clipLenSec", v)}
        />
        <NumberField
          id="storage"
          label="저장 공간 경고 임계값"
          suffix="%"
          min={50}
          max={98}
          step={1}
          value={settings.storageThresholdPct}
          onChange={(v) => update("storageThresholdPct", v)}
        />
      </Card>

      {/* Mask zones */}
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
          감지 영역 마스크
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          감지할 영역(셀)을 선택하세요. 선택된 셀만 모션을 감지합니다. (8×6)
        </p>
        <MaskGrid
          cells={settings.mask}
          onChange={(m) => update("mask", m)}
        />
      </Card>

      {/* Schedule */}
      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            감시 스케줄
          </h2>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.scheduleEnabled}
              onChange={(e) => update("scheduleEnabled", e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            사용
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="start" className="mb-1 block text-xs text-muted-foreground">
              시작 시각
            </label>
            <input
              id="start"
              type="time"
              value={settings.scheduleStart}
              disabled={!settings.scheduleEnabled}
              onChange={(e) => update("scheduleStart", e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="end" className="mb-1 block text-xs text-muted-foreground">
              종료 시각
            </label>
            <input
              id="end"
              type="time"
              value={settings.scheduleEnd}
              disabled={!settings.scheduleEnabled}
              onChange={(e) => update("scheduleEnd", e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          지정한 시간대에만 모션 감지를 활성화합니다. (야간 감시 예:
          18:00~07:00)
        </p>
      </Card>

      {/* Notifications / save */}
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
          알림 (텔레그램)
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          감지 이벤트를 텔레그램으로 전송합니다. 연결 상태를 확인하려면 테스트
          메시지를 보내세요.
        </p>
        <button
          type="button"
          onClick={testTelegram}
          disabled={testing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          텔레그램 테스트 전송
        </button>

        <div className="my-4 h-px bg-border" />

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>마스크 비트</span>
            <span className="font-mono">{maskToHex(settings.mask)}</span>
          </div>
          {saved ? (
            <div className="mt-1 flex justify-between">
              <span>마지막 저장</span>
              <span className="font-mono">
                {new Date(saved).toLocaleTimeString("ko-KR")}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Save className="h-4 w-4" aria-hidden /> 저장
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> 초기화
          </button>
        </div>
      </Card>

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

function NumberField({
  id,
  label,
  suffix,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded-lg border border-border bg-input px-3 py-2 text-sm tabular-nums outline-none focus:border-primary"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}
