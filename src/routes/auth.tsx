import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { studentLogin } from "@/lib/exam/student.functions";
import { writeStudentToken } from "@/lib/exam/student-token";
import { LoginScreen, type LoginRole } from "@/components/site/LoginScreen";
import "@lovable.dev/cloud-auth-js/styles.css";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Đăng nhập · Lớp Học Số" },
      {
        name: "description",
        content:
          "Đăng nhập Lớp Học Số dành cho học sinh và giáo viên: bài giảng tương tác, mô hình 3D, thi trực tuyến.",
      },
      { property: "og:title", content: "Đăng nhập · Lớp Học Số" },
      { property: "og:description", content: "Kết nối tri thức – Kiến tạo tương lai." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const login = useServerFn(studentLogin);
  const [role, setRole] = useState<LoginRole | null>(null);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("vai-tro");
    setRole(wanted === "hoc-sinh" ? "student" : "teacher");
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/" });
    });
  }, [navigate]);
  if (!role) return null;
  return (
    <LoginScreen
      initialRole={role}
      onStudentLogin={async (username, password) => {
        const r = await login({ data: { username, password } });
        writeStudentToken(r.token);
        await navigate({ to: "/hoc-sinh" });
      }}
    />
  );
}
