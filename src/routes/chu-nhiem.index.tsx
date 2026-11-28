import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { OverviewPage } from "@/components/homeroom/OverviewPage";

export const Route = createFileRoute("/chu-nhiem/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Lớp chủ nhiệm · Lớp Học Số" },
      {
        name: "description",
        content: "Tổng quan lớp chủ nhiệm: sĩ số, điểm danh hôm nay và việc cần làm.",
      },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-overview" title="Lớp chủ nhiệm">
      {(ctx) => <OverviewPage {...ctx} />}
    </HomeroomFrame>
  ),
});
