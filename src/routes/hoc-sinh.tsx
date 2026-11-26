import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentPortal } from "@/components/exam/StudentPortal";

export const Route = createFileRoute("/hoc-sinh")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Học sinh đăng nhập · Hình học 3D" },
      {
        name: "description",
        content:
          "Học sinh đăng nhập bằng tài khoản giáo viên cấp để xem bài được giao và làm bài thi online.",
      },
      { property: "og:title", content: "Học sinh đăng nhập · Hình học 3D" },
      {
        property: "og:description",
        content: "Trang cá nhân của học sinh: bài được giao, lịch sử làm bài, bài giảng.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentPage,
});

function StudentPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-4 py-4">
      <header className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft />
            Trang chủ
          </Link>
        </Button>
      </header>
      <StudentPortal />
    </main>
  );
}
