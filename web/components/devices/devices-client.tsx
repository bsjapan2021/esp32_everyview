"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Cpu,
  MapPin,
  KeyRound,
  Loader2,
  X,
} from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { StatusBadge, RssiIndicator } from "@/components/indicators";
import { RelativeTime } from "@/components/relative-time";
import { uid } from "@/lib/utils";
import type { Device } from "@/types/db";

export function DevicesClient({ initialDevices }: { initialDevices: Device[] }) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ device_key: "", name: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.device_key.trim().length < 3) {
      setError("device_key는 3자 이상이어야 합니다.");
      return;
    }
    if (!form.name.trim()) {
      setError("이름을 입력하세요.");
      return;
    }
    if (devices.some((d) => d.device_key === form.device_key.trim())) {
      setError("이미 등록된 device_key입니다.");
      return;
    }

    setBusy(true);
    const optimistic: Device = {
      id: uid(),
      device_key: form.device_key.trim(),
      name: form.name.trim(),
      location: form.location.trim() || null,
      fw_version: null,
      last_seen_at: null,
      rssi: null,
      sd_used_pct: null,
      time_synced: false,
      created_at: new Date().toISOString(),
    };
    setDevices((prev) => [...prev, optimistic]);

    try {
      await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_key: optimistic.device_key,
          name: optimistic.name,
          location: optimistic.location ?? undefined,
        }),
      });
    } catch {
      /* keep optimistic row in demo mode */
    }
    setBusy(false);
    setForm({ device_key: "", name: "", location: "" });
    setShowForm(false);
    setToast("디바이스를 등록했습니다.");
  }

  async function remove(device: Device) {
    if (!window.confirm(`'${device.name}' 디바이스를 삭제하시겠습니까?`)) return;
    const prev = devices;
    setDevices((cur) => cur.filter((d) => d.id !== device.id));
    try {
      await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
    } catch {
      setDevices(prev);
      setToast("삭제에 실패했습니다.");
      return;
    }
    setToast("디바이스를 삭제했습니다.");
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {showForm ? (
            <X className="h-4 w-4" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {showForm ? "취소" : "디바이스 등록"}
        </button>
      </div>

      {showForm ? (
        <Card className="mb-6 p-4">
          <form onSubmit={register} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="device_key" className="mb-1 block text-xs text-muted-foreground">
                  Device Key <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    id="device_key"
                    value={form.device_key}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, device_key: e.target.value }))
                    }
                    placeholder="cam-front-a1b2c3"
                    className="w-full rounded-lg border border-border bg-input py-2 pl-8 pr-3 font-mono text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="name" className="mb-1 block text-xs text-muted-foreground">
                  이름 <span className="text-danger">*</span>
                </label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="현관 카메라"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="location" className="mb-1 block text-xs text-muted-foreground">
                  위치
                </label>
                <input
                  id="location"
                  value={form.location}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, location: e.target.value }))
                  }
                  placeholder="1층 현관"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              등록
            </button>
          </form>
        </Card>
      ) : null}

      {devices.length === 0 ? (
        <EmptyState
          title="등록된 디바이스가 없습니다"
          description="device_key로 첫 카메라를 등록하세요."
          icon={<Cpu className="h-8 w-8" />}
        />
      ) : (
        <div className="overflow-x-auto">
          <Card className="min-w-[640px] p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">이름</th>
                  <th className="p-3 font-medium">Device Key</th>
                  <th className="p-3 font-medium">상태</th>
                  <th className="p-3 font-medium">신호</th>
                  <th className="p-3 font-medium">마지막 응답</th>
                  <th className="p-3 font-medium">펌웨어</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 last:border-0">
                    <td className="p-3">
                      <div className="font-medium">{d.name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {d.location ?? "위치 미지정"}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {d.device_key}
                    </td>
                    <td className="p-3">
                      <StatusBadge lastSeenAt={d.last_seen_at} />
                    </td>
                    <td className="p-3">
                      <RssiIndicator rssi={d.rssi} showLabel={false} />
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {d.last_seen_at ? (
                        <RelativeTime iso={d.last_seen_at} />
                      ) : (
                        "기록 없음"
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {d.fw_version ?? "-"}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => remove(d)}
                        aria-label={`${d.name} 삭제`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

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
