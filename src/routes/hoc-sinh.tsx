import { createFileRoute } from "@tanstack/react-router";
import { StudentPortal } from "@/components/exam/StudentPortal";

export const Route = createFileRoute("/hoc-sinh")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Học sinh · Lớp Học Số" },
      {
        name: "description",
        content:
          "Học sinh đăng nhập bằng tài khoản giáo viên cấp để xem bài được giao và làm bài thi online.",
      },
      { property: "og:title", content: "Học sinh · Lớp Học Số" },
      {
        property: "og:description",
        content: "Trang cá nhân của học sinh: bài thi, kết quả học tập, bài giảng.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPortal,
});
