import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeacher } from "@/components/slides/use-teacher";
import { TeacherShell } from "@/components/site/TeacherShell";
import { GradebookPage } from "@/components/gradebook/GradebookPage";

export const Route = createFileRoute("/so-diem")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sổ điểm cá nhân · Lớp Học Số" },
      {
        name: "description",
        content:
          "Sổ điểm cá nhân theo lớp, môn, học kỳ; nhập và xuất file SMAS; điểm cộng, điểm trừ.",
      },
    ],
  }),
  component: GradebookRoute,
});

function GradebookRoute() {
  const user = useTeacher();
  return (
    <TeacherShell current="gradebook" title="Sổ điểm cá nhân">
      {user === undefined ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : user === null ? (
        <div className="mx-auto max-w-sm py-10 text-center">
          <p className="mb-4">Đăng nhập tài khoản giáo viên để dùng sổ điểm.</p>
          <Button asChild>
            <Link to="/auth">
              <GraduationCap />
              Đăng nhập giáo viên
            </Link>
          </Button>
        </div>
      ) : (
        <GradebookPage />
      )}
    </TeacherShell>
  );
}
