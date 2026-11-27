import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGES = [
  { to: "/lop-thi", label: "Lớp và tài khoản" },
  { to: "/ngan-hang-de", label: "Ngân hàng đề" },
  { to: "/ma-tran-de", label: "Ma trận đề" },
  { to: "/giao-bai", label: "Giao bài" },
] as const;

/** Header shared by the teacher's online-exam pages. */
export function ExamNav({ current }: { current: (typeof PAGES)[number]["to"] }) {
  return (
    <header className="mb-4 flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/">
          <ArrowLeft />
          Lớp học
        </Link>
      </Button>
      <h1 className="text-lg font-semibold">Thi online</h1>
      <nav className="flex gap-1" aria-label="Thi online">
        {PAGES.map((p) => (
          <Button key={p.to} size="sm" variant={p.to === current ? "default" : "ghost"} asChild>
            <Link to={p.to}>{p.label}</Link>
          </Button>
        ))}
      </nav>
    </header>
  );
}
