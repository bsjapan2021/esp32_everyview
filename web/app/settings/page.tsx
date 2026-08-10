import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
  title: "설정 · ESP32CAM-Guard",
};

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="설정"
        description="모션 감도, 감지 영역, 스케줄, 알림을 구성합니다. 저장된 설정은 하트비트를 통해 디바이스로 전달됩니다."
        icon={<Settings className="h-5 w-5" />}
      />
      <SettingsForm />
    </div>
  );
}
