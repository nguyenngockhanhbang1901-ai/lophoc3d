import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SlideEditor } from "@/components/slides/SlideEditor";
import { AuthorCredit, SiteLogo } from "@/components/site/brand";
import { useTeacher } from "@/components/slides/use-teacher";

export const Route = createFileRoute("/soan-bai")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Soạn bài giảng · Lớp học Hình học 3D" },
      {
        name: "description",
        content:
          "Soạn bài giảng dạng slide: thêm hoạt động, thêm slide, sửa nội dung mà không cần sửa code.",
      },
      { property: "og:title", content: "Soạn bài giảng · Hình học 3D" },
      { property: "og:description", content: "Công cụ soạn bài giảng slide cho giáo viên." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { lesson?: string } =>
    typeof search["lesson"] === "string" && search["lesson"] ? { lesson: search["lesson"] } : {},
  component: SlideEditorPage,
});

function SlideEditorPage() {
  const user = useTeacher();
  const { lesson = "" } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="site-page">
      <header className="sticky top-0 z-30 mb-4 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4">
          <SiteLogo compact />
          <span className="h-6 w-px bg-border" />
          <h1 className="site-title text-lg">Soạn bài giảng</h1>
          <Button variant="ghost" size="sm" className="ml-auto" asChild>
            <Link to="/">
              <ArrowLeft />
              Tổng quan
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto min-h-screen max-w-[1500px] px-4 pb-4">
        {user === undefined ? (
          <p role="status">Đang kiểm tra đăng nhập…</p>
        ) : user === null ? (
          <section className="max-w-md">
            <p className="mb-4">
              Đăng nhập tài khoản giáo viên để soạn bài giảng. Mỗi tài khoản chỉ thấy bài của chính
              mình.
            </p>
            <Button
              onClick={() => {
                void navigate({ to: "/auth" });
              }}
            >
              <GraduationCap />
              Đăng nhập giáo viên
            </Button>
          </section>
        ) : (
          <SlideEditor userId={user.id} initialKey={lesson} />
        )}
      </main>
      <footer className="mx-auto flex max-w-[1500px] justify-end px-4 pb-4">
        <AuthorCredit />
      </footer>
    </div>
  );
}
