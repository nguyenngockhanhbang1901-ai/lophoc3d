import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { MeritPage } from "@/components/homeroom/MeritPage";

export const Route = createFileRoute("/chu-nhiem/thi-dua")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Thi đua – Khen thưởng · Lớp Học Số" },
      {
        name: "description",
        content: "Ghi nhận theo tiết, khen thưởng – vi phạm và xếp loại thi đua tuần.",
      },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-merit" title="Thi đua – Khen thưởng">
      {(ctx) => <MeritPage {...ctx} />}
    </HomeroomFrame>
  ),
});
