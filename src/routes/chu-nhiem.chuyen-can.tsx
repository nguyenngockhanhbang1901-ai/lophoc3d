import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { AttendanceStatsPage } from "@/components/homeroom/AttendanceStatsPage";

export const Route = createFileRoute("/chu-nhiem/chuyen-can")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Thống kê chuyên cần · Lớp Học Số" },
      { name: "description", content: "Thống kê chuyên cần theo tuần, tháng, học kỳ." },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-stats" title="Thống kê chuyên cần">
      {(ctx) => <AttendanceStatsPage {...ctx} />}
    </HomeroomFrame>
  ),
});
