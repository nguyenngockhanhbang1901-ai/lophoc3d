import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeacher } from "@/components/slides/use-teacher";
import { TeacherClasses } from "@/components/exam/TeacherClasses";

export const Route = createFileRoute("/lop-thi")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Lớp và tài khoản học sinh · Thi online" },
      {
        name: "description",
        content: "Giáo viên tạo lớp, nhập danh sách học sinh từ Excel và cấp tài khoản thi online.",
      },
      { property: "og:title", content: "Thi online · Lớp và tài khoản học sinh" },
      {
        property: "og:description",
        content: "Quản lý lớp và tài khoản học sinh cho chế độ thi online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeacherClassesPage,
});

function TeacherClassesPage() {
  const user = useTeacher();
  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft />
            Lớp học
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Thi online · Lớp và tài khoản học sinh</h1>
      </header>
      {user === undefined ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : user === null ? (
        <div className="mx-auto max-w-sm py-10 text-center">
          <p className="mb-4">
            Đăng nhập tài khoản giáo viên để quản lý lớp và tài khoản học sinh.
          </p>
          <Button asChild>
            <Link to="/auth">
              <GraduationCap />
              Đăng nhập giáo viên
            </Link>
          </Button>
        </div>
      ) : (
        <TeacherClasses />
      )}
    </main>
  );
}
