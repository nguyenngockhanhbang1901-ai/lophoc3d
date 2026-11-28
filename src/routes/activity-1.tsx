import { createFileRoute, Link } from '@tanstack/react-router';
import ActivityOne from '@/components/ActivityOne';
import { Button } from '@/components/ui/button';
import { useTeacher } from '@/components/slides/use-teacher';
import { isOwnerEmail } from '@/lib/site-owner';

export const Route = createFileRoute('/activity-1')({
  ssr: false,
  head: () => ({ meta: [
    { title: 'Hoạt động 1 · Khung thành bóng đá 3D | Hình học 3D' },
    { name: 'description', content: 'Quan sát mô hình khung thành bóng đá 11 người bằng thép và lưới trong không gian 3D có thể xoay camera.' },
    { property: 'og:title', content: 'Hoạt động 1 · Khung thành bóng đá 3D' },
    { property: 'og:description', content: 'Mô hình 3D khung thành bóng đá để khám phá hình học không gian.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: OwnerOnlyActivity,
});

/** Personal website: the standalone model is for the owner; guests enter lessons with a class code. */
function OwnerOnlyActivity() {
  const user = useTeacher();
  if (user === undefined) return <div className="site-page" />;
  if (user && isOwnerEmail(user.email)) return <ActivityOne />;
  return (
    <div className="site-page grid min-h-screen place-items-center p-6">
      <div className="site-card max-w-sm p-6 text-center">
        <h1 className="site-title mb-2 text-xl">Cần mã lớp để xem bài giảng</h1>
        <p className="mb-4 text-sm text-muted-foreground">Bài giảng chỉ mở trong giờ học. Hãy nhập mã lớp thầy cô cung cấp.</p>
        <Button asChild><a href="/?vao=ma-lop">Nhập mã lớp</a></Button>
        <p className="mt-3 text-xs"><Link to="/" className="text-primary underline">Về trang chủ</Link></p>
      </div>
    </div>
  );
}
