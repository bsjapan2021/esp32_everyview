import type { Metadata } from "next";
import { ListVideo } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { EventsClient } from "@/components/events/events-client";
import { UnconfiguredNotice } from "@/components/unconfigured-notice";
import { getDevices, backendConfigured } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "이벤트 · ESP32CAM-Guard",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const { device } = await searchParams;
  const devices = await getDevices();

  return (
    <div>
      {!backendConfigured() ? <UnconfiguredNotice /> : null}
      <PageHeader
        title="이벤트 타임라인"
        description="감지 시각을 기준으로 이벤트를 살펴보고 보호·삭제할 수 있습니다."
        icon={<ListVideo className="h-5 w-5" />}
      />
      <EventsClient devices={devices} initialDeviceId={device} />
    </div>
  );
}
