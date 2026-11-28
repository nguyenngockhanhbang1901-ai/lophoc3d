import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { ParentsPage } from "@/components/homeroom/ParentsPage";

export const Route = createFileRoute("/chu-nhiem/phu-huynh")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trao đổi với phụ huynh · Lớp Học Số" },
      { name: "description", content: "Nhật ký trao đổi với phụ huynh và hẹn liên hệ lại." },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-parents" title="Trao đổi với phụ huynh">
      {(ctx) => <ParentsPage {...ctx} />}
    </HomeroomFrame>
  ),
});
