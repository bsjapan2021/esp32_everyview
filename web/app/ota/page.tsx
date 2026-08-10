import type { Metadata } from "next";
import { HardDriveDownload } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { OtaClient } from "@/components/ota/ota-client";

export const metadata: Metadata = {
  title: "펌웨어 · ESP32CAM-Guard",
};

export default function OtaPage() {
  return (
    <div>
      <PageHeader
        title="펌웨어 관리 (OTA)"
        description="디바이스 펌웨어 버전을 확인하고 무선으로 업데이트합니다."
        icon={<HardDriveDownload className="h-5 w-5" />}
      />
      <OtaClient />
    </div>
  );
}
