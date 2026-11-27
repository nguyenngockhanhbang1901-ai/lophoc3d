-- Thi online · Giai đoạn 8: quyền thi lại và thông báo cho học sinh.
-- Giáo viên cấp quyền thi lại (lý do, hạn dùng), thu hồi quyền chưa dùng; mỗi quyền mở đúng
-- một lượt mới. Thông báo: bài mới, được cấp hoặc bị thu hồi quyền thi lại.
-- Máy chủ ghi qua service_role sau khi kiểm tra lớp thuộc giáo viên; giáo viên đọc qua RLS.

CREATE TABLE public.exam_retake_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.exam_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  used_attempt_id uuid REFERENCES public.exam_attempts(id) ON DELETE SET NULL,
  revoked_at timestamptz
);
CREATE INDEX exam_retake_grants_student_idx
  ON public.exam_retake_grants (assignment_id, student_id);
CREATE INDEX exam_retake_grants_owner_idx ON public.exam_retake_grants (owner_id);
CREATE INDEX exam_retake_grants_attempt_idx ON public.exam_retake_grants (used_attempt_id);
GRANT SELECT ON public.exam_retake_grants TO authenticated;
GRANT ALL ON public.exam_retake_grants TO service_role;
ALTER TABLE public.exam_retake_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their retake grants" ON public.exam_retake_grants
  FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

CREATE TABLE public.exam_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.exam_assignments(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('new_assignment', 'retake_granted', 'retake_revoked')),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX exam_notifications_student_idx
  ON public.exam_notifications (student_id, created_at DESC);
CREATE INDEX exam_notifications_owner_idx ON public.exam_notifications (owner_id);
CREATE INDEX exam_notifications_assignment_idx ON public.exam_notifications (assignment_id);
GRANT SELECT ON public.exam_notifications TO authenticated;
GRANT ALL ON public.exam_notifications TO service_role;
ALTER TABLE public.exam_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read notifications they caused" ON public.exam_notifications
  FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));

-- chỉ mục còn thiếu cho khóa ngoại của nhật ký mất kết nối (gợi ý của Lovable ở giai đoạn 7)
CREATE INDEX exam_connection_events_attempt_idx ON public.exam_connection_events (attempt_id);
CREATE INDEX exam_connection_events_student_only_idx ON public.exam_connection_events (student_id);