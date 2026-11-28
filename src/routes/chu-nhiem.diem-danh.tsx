import { createFileRoute } from "@tanstack/react-router";
import { HomeroomFrame } from "@/components/homeroom/HomeroomFrame";
import { AttendancePage } from "@/components/homeroom/AttendancePage";

export const Route = createFileRoute("/chu-nhiem/diem-danh")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Điểm danh · Lớp Học Số" },
      { name: "description", content: "Điểm danh học sinh lớp chủ nhiệm theo ngày." },
    ],
  }),
  component: () => (
    <HomeroomFrame current="hr-attendance" title="Điểm danh">
      {(ctx) => <AttendancePage {...ctx} />}
    </HomeroomFrame>
  ),
});
