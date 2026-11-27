import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeacher } from "@/components/slides/use-teacher";
import { ExamNav } from "@/components/exam/ExamNav";
import { ExamAssignments } from "@/components/exam/ExamAssignments";
import { LessonAssignments } from "@/components/exam/LessonAssignments";

export const Route = createFileRoute("/giao-bai")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Giao bài · Thi online" },
      {
        name: "description",
        content: "Giáo viên giao bài kiểm tra cho lớp, hẹn giờ mở và đóng, xem kết quả.",
      },
      { property: "og:title", content: "Giao bài · Thi online" },
      { property: "og:description", content: "Hẹn giờ giao bài kiểm tra online theo ma trận đề." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssignPage,
});

function AssignPage() {
  const user = useTeacher();
  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-4 py-4">
      <ExamNav current="/giao-bai" />
      {user === undefined ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : user === null ? (
        <div className="mx-auto max-w-sm py-10 text-center">
          <p className="mb-4">Đăng nhập tài khoản giáo viên để giao bài.</p>
          <Button asChild>
            <Link to="/auth">
              <GraduationCap />
              Đăng nhập giáo viên
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <ExamAssignments userId={user.id} />
          <LessonAssignments ownerId={user.id} />
        </>
      )}
    </main>
  );
}
