import type { Metadata } from "next";
import { Video } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { LiveView } from "@/components/live/live-view";

export const metadata: Metadata = {
  title: "라이브 · ESP32CAM-Guard",
};

export default function LivePage() {
  return (
    <div>
      <PageHeader
        title="라이브 뷰"
        description="같은 네트워크에서 ESP32-CAM에 직접 연결해 실시간 영상을 확인합니다."
        icon={<Video className="h-5 w-5" />}
      />
      <LiveView />
    </div>
  );
}
