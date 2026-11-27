-- Thi online · Giai đoạn 10: giao bài giảng (dạng slide) cho lớp ở chế độ chỉ xem.
-- Bài giảng vẫn nằm ở bảng lessons của giáo viên; bảng này chỉ ghi bài nào giao cho lớp nào,
-- từ lúc nào, và học sinh nào đã mở. Học sinh đọc qua máy chủ (service_role), không sửa được.

CREATE TABLE public.exam_lesson_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_key text NOT NULL CHECK (char_length(lesson_key) <= 120),
  opens_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, lesson_key)
);
CREATE INDEX exam_lesson_assignments_owner_idx ON public.exam_lesson_assignments (owner_id);
GRANT SELECT ON public.exam_lesson_assignments TO authenticated;
GRANT ALL ON public.exam_lesson_assignments TO service_role;
ALTER TABLE public.exam_lesson_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their lesson assignments" ON public.exam_lesson_assignments
  FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

CREATE TABLE public.exam_lesson_views (
  lesson_assignment_id uuid NOT NULL
    REFERENCES public.exam_lesson_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  open_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (lesson_assignment_id, student_id)
);
CREATE INDEX exam_lesson_views_student_idx ON public.exam_lesson_views (student_id);
CREATE INDEX exam_lesson_views_owner_idx ON public.exam_lesson_views (owner_id);
GRANT SELECT ON public.exam_lesson_views TO authenticated;
GRANT ALL ON public.exam_lesson_views TO service_role;
ALTER TABLE public.exam_lesson_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read lesson views of their classes" ON public.exam_lesson_views
  FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

-- thông báo "có bài giảng mới"
ALTER TABLE public.exam_notifications DROP CONSTRAINT exam_notifications_kind_check;
ALTER TABLE public.exam_notifications ADD CONSTRAINT exam_notifications_kind_check
  CHECK (kind IN ('new_assignment', 'retake_granted', 'retake_revoked', 'new_lesson'));
ALTER TABLE public.exam_notifications
  ADD COLUMN lesson_assignment_id uuid
    REFERENCES public.exam_lesson_assignments(id) ON DELETE CASCADE;
CREATE INDEX exam_notifications_lesson_idx ON public.exam_notifications (lesson_assignment_id);

-- chỉ mục cho khóa ngoại student_id của quyền thi lại (gợi ý của Lovable ở giai đoạn 8)
CREATE INDEX exam_retake_grants_student_only_idx ON public.exam_retake_grants (student_id);
