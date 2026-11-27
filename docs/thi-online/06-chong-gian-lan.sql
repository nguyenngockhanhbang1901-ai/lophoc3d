-- Thi online · Giai đoạn 7: chống gian lận.
-- Nhịp kết nối của bài làm (phát hiện mất mạng), khóa một thiết bị, luật sửa đáp án,
-- nhật ký vi phạm (thoát toàn màn hình, chuyển tab…) và nhật ký mất kết nối.
-- Học sinh không đọc trực tiếp các bảng này; máy chủ ghi qua service_role.
-- Giáo viên đọc nhật ký của lớp mình qua RLS.

ALTER TABLE public.exam_attempts
  ADD COLUMN last_heartbeat_at timestamptz,
  ADD COLUMN session_hash text,
  ADD COLUMN edit_warned_at timestamptz,
  ADD COLUMN edit_count integer NOT NULL DEFAULT 0;

CREATE TABLE public.exam_violations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('fullscreen_exit', 'tab_hidden', 'window_blur', 'second_device', 'edit_warning')),
  counted boolean NOT NULL DEFAULT true,
  away_ms integer,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_violations_attempt_idx ON public.exam_violations (attempt_id, at);
CREATE INDEX exam_violations_owner_idx ON public.exam_violations (owner_id);
GRANT SELECT ON public.exam_violations TO authenticated;
GRANT ALL ON public.exam_violations TO service_role;
ALTER TABLE public.exam_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read violations of their classes" ON public.exam_violations
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.exam_connection_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.exam_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  drop_number integer NOT NULL CHECK (drop_number >= 1),
  outcome text NOT NULL CHECK (outcome IN ('continue', 'new_exam', 'new_exam_counted'))
);
CREATE INDEX exam_connection_events_student_idx
  ON public.exam_connection_events (assignment_id, student_id);
CREATE INDEX exam_connection_events_owner_idx ON public.exam_connection_events (owner_id);
GRANT SELECT ON public.exam_connection_events TO authenticated;
GRANT ALL ON public.exam_connection_events TO service_role;
ALTER TABLE public.exam_connection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read connection events of their classes" ON public.exam_connection_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
