import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { ReportsPage } from "@/components/homeroom/ReportsPage";

export const Route = createFileRoute("/chu-nhiem/bao-cao")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Báo cáo · Lớp Học Số" },
      {
        name: "description",
        content: "Báo cáo theo tuần, tháng, học kỳ và phiếu theo dõi từng học sinh.",
      },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-reports" title="Báo cáo">
      {(ctx) => <ReportsPage {...ctx} />}
    </HomeroomFrame>
  ),
});
