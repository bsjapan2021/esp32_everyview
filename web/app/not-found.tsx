import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        요청하신 페이지 또는 이벤트가 존재하지 않습니다.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        대시보드로 돌아가기
      </Link>
    </div>
  );
}
