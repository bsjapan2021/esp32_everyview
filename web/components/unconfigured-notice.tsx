import { Info } from "lucide-react";

/**
 * Shown when Supabase is not configured. Explains that the UI is running on
 * demo/mock data so the dashboard is never blank or confusing.
 */
export function UnconfiguredNotice() {
  return (
    <div
      className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm"
      role="status"
    >
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold text-foreground">데모 데이터로 실행 중</p>
        <p className="text-muted-foreground">
          Supabase 환경변수가 설정되지 않아 예시 데이터를 표시하고 있습니다.{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          및{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            SUPABASE_SERVICE_ROLE_KEY
          </code>
          를 설정하면 실제 디바이스 데이터가 연결됩니다. (
          <code className="font-mono text-xs">.env.example</code> 참고)
        </p>
      </div>
    </div>
  );
}
