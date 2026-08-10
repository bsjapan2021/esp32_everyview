import Link from "next/link";
import { LayoutDashboard, ChevronRight, Camera, Activity } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  PageHeader,
  EmptyState,
} from "@/components/ui";
import { DeviceCard } from "@/components/device-card";
import { EventThumb } from "@/components/event-thumb";
import { EventsChart } from "@/components/events-chart";
import { UnconfiguredNotice } from "@/components/unconfigured-notice";
import {
  getDevices,
  getRecentEvents,
  getHourlyBuckets,
  backendConfigured,
} from "@/lib/data";
import { isOnline } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [devices, recentEvents, buckets] = await Promise.all([
    getDevices(),
    getRecentEvents(6),
    getHourlyBuckets(),
  ]);

  const onlineCount = devices.filter((d) => isOnline(d.last_seen_at)).length;
  const total24h = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      {!backendConfigured() ? <UnconfiguredNotice /> : null}

      <PageHeader
        title="대시보드"
        description="디바이스 상태와 최근 감지 이벤트를 한눈에 확인하세요."
        icon={<LayoutDashboard className="h-5 w-5" />}
      />

      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="전체 디바이스" value={`${devices.length}`} />
        <StatTile
          label="온라인"
          value={`${onlineCount}`}
          tone="text-online"
        />
        <StatTile
          label="오프라인"
          value={`${devices.length - onlineCount}`}
          tone="text-offline"
        />
        <StatTile label="24시간 이벤트" value={`${total24h}`} />
      </div>

      {/* Devices */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">디바이스</h2>
          <Link
            href="/devices"
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
          >
            관리 <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {devices.length === 0 ? (
          <EmptyState
            title="등록된 디바이스가 없습니다"
            description="디바이스 관리 페이지에서 device_key로 카메라를 등록하세요."
            icon={<Camera className="h-8 w-8" />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent events */}
        <section className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>최근 감지 이벤트</CardTitle>
              <Link
                href="/events"
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                전체 보기 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </CardHeader>
            <CardContent>
              {recentEvents.length === 0 ? (
                <EmptyState
                  title="아직 감지된 이벤트가 없습니다"
                  icon={<Activity className="h-8 w-8" />}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {recentEvents.map((e) => (
                    <EventThumb key={e.id} event={e} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 24h chart */}
        <section className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>24시간 이벤트 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <EventsChart data={buckets} />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? ""}`}>
        {value}
      </p>
    </Card>
  );
}
