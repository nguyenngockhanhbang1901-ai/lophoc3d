import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { GradesPage } from "@/components/homeroom/GradesPage";

export const Route = createFileRoute("/chu-nhiem/danh-gia")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Điểm & đánh giá · Lớp Học Số" },
      {
        name: "description",
        content: "Điểm các môn, mức học tập và rèn luyện theo Thông tư 22, nhận xét học kỳ.",
      },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-grades" title="Điểm & đánh giá">
      {(ctx) => <GradesPage {...ctx} />}
    </HomeroomFrame>
  ),
});
