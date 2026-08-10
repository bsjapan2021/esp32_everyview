import type { Metadata } from "next";
import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { DevicesClient } from "@/components/devices/devices-client";
import { UnconfiguredNotice } from "@/components/unconfigured-notice";
import { getDevices, backendConfigured } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "디바이스 · ESP32CAM-Guard",
};

export default async function DevicesPage() {
  const devices = await getDevices();

  return (
    <div>
      {!backendConfigured() ? <UnconfiguredNotice /> : null}
      <PageHeader
        title="디바이스 관리"
        description="카메라를 등록하고 상태를 확인하며 삭제합니다."
        icon={<Cpu className="h-5 w-5" />}
      />
      <DevicesClient initialDevices={devices} />
    </div>
  );
}
