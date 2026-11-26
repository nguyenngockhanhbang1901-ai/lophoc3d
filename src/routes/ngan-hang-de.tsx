import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeacher } from "@/components/slides/use-teacher";
import { ExamNav } from "@/components/exam/ExamNav";
import { QuestionBank } from "@/components/exam/QuestionBank";

export const Route = createFileRoute("/ngan-hang-de")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ngân hàng đề · Thi online" },
      {
        name: "description",
        content:
          "Giáo viên soạn ngân hàng câu hỏi: trắc nghiệm, đúng/sai, trả lời ngắn, có công thức toán và hình minh họa.",
      },
      { property: "og:title", content: "Ngân hàng đề · Thi online" },
      { property: "og:description", content: "Soạn câu hỏi cho bài kiểm tra online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuestionBankPage,
});

function QuestionBankPage() {
  const user = useTeacher();
  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-4 py-4">
      <ExamNav current="/ngan-hang-de" />
      {user === undefined ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : user === null ? (
        <div className="mx-auto max-w-sm py-10 text-center">
          <p className="mb-4">Đăng nhập tài khoản giáo viên để soạn ngân hàng đề.</p>
          <Button asChild>
            <Link to="/auth">
              <GraduationCap />
              Đăng nhập giáo viên
            </Link>
          </Button>
        </div>
      ) : (
        <QuestionBank userId={user.id} />
      )}
    </main>
  );
}
