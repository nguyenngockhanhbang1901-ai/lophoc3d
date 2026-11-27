import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeacher } from "@/components/slides/use-teacher";
import { ExamNav } from "@/components/exam/ExamNav";
import { ExamMatrices } from "@/components/exam/ExamMatrices";

export const Route = createFileRoute("/ma-tran-de")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ma trận đề · Thi online" },
      {
        name: "description",
        content:
          "Giáo viên xây ma trận đề, xem số đề khác nhau và xem thử đề ngẫu nhiên cho từng học sinh.",
      },
      { property: "og:title", content: "Ma trận đề · Thi online" },
      {
        property: "og:description",
        content: "Mỗi học sinh một đề khác nhau, sinh ngẫu nhiên theo ma trận.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MatrixPage,
});

function MatrixPage() {
  const user = useTeacher();
  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-4 py-4">
      <ExamNav current="/ma-tran-de" />
      {user === undefined ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : user === null ? (
        <div className="mx-auto max-w-sm py-10 text-center">
          <p className="mb-4">Đăng nhập tài khoản giáo viên để xây ma trận đề.</p>
          <Button asChild>
            <Link to="/auth">
              <GraduationCap />
              Đăng nhập giáo viên
            </Link>
          </Button>
        </div>
      ) : (
        <ExamMatrices />
      )}
    </main>
  );
}
