import { createFileRoute } from "@tanstack/react-router";
import Classroom from '@/components/Classroom';

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [
    { title: 'Bài 11 và Bài 12 · Lớp học Hình học 3D' },
    { name: 'description', content: 'Bài học hình học không gian với mô hình 3D, danh mục bài học của giáo viên và câu trả lời theo tổ.' },
    { property: 'og:title', content: 'Hình học 3D · Bài học không gian' },
    { property: 'og:description', content: 'Khám phá hai đường thẳng song song và đường thẳng song song với mặt phẳng trong lớp học tương tác.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: Classroom,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
