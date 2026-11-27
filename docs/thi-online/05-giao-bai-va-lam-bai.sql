-- Thi online · Giai đoạn 5–6: giao bài, lượt làm bài, câu trả lời.
-- Bài giao chụp lại ma trận lúc giao (slots), nên sửa ma trận sau đó không ảnh hưởng bài đã giao.
-- Học sinh không đọc trực tiếp các bảng này: mọi thao tác làm bài đi qua server functions
-- (service_role), máy chủ giữ đồng hồ và chấm điểm. Giáo viên đọc kết quả lớp mình qua RLS.

CREATE TABLE public.exam_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  matrix_id uuid REFERENCES public.exam_matrices(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
  slots jsonb NOT NULL CHECK (jsonb_typeof(slots) = 'array' AND jsonb_array_length(slots) BETWEEN 1 AND 200),
  shuffle_options boolean NOT NULL DEFAULT true,
  shuffle_order boolean NOT NULL DEFAULT false,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 300),
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 20),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);
CREATE INDEX exam_assignments_owner_idx ON public.exam_assignments (owner_id);
CREATE INDEX exam_assignments_class_idx ON public.exam_assignments (class_id, opens_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_assignments TO authenticated;
GRANT ALL ON public.exam_assignments TO service_role;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their assignments" ON public.exam_assignments FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Teachers add their assignments" ON public.exam_assignments FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.exam_classes c WHERE c.id = class_id AND c.owner_id = auth.uid()));
CREATE POLICY "Teachers change their assignments" ON public.exam_assignments FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.exam_classes c WHERE c.id = class_id AND c.owner_id = auth.uid()));
CREATE POLICY "Teachers remove their assignments" ON public.exam_assignments FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.exam_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'timeout', 'violation', 'cancelled_network', 'cancelled_edit')),
  counts_toward_attempts boolean NOT NULL DEFAULT true,
  code text NOT NULL,
  items jsonb NOT NULL,
  reached_index integer NOT NULL DEFAULT 0,
  rules_accepted_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  completed_all_at timestamptz,
  finished_at timestamptz,
  score numeric(6, 2),
  correct_count integer,
  results jsonb,
  violation_count integer NOT NULL DEFAULT 0,
  disconnect_count integer NOT NULL DEFAULT 0,
  user_agent text NOT NULL DEFAULT '' CHECK (char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_attempts_assignment_idx ON public.exam_attempts (assignment_id, student_id);
CREATE INDEX exam_attempts_student_idx ON public.exam_attempts (student_id, created_at DESC);
-- at most one unfinished attempt per student and assignment
CREATE UNIQUE INDEX exam_attempts_one_open_idx ON public.exam_attempts (assignment_id, student_id) WHERE status = 'in_progress';
GRANT SELECT ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exam_attempts TO service_role;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read attempts of their classes" ON public.exam_attempts FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.exam_answers (
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  item_index integer NOT NULL CHECK (item_index BETWEEN 0 AND 199),
  answer jsonb NOT NULL,
  answer_at_completion jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, item_index)
);
GRANT ALL ON public.exam_answers TO service_role;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

-- every choice and every change, for the teacher's review of how the exam was taken
CREATE TABLE public.exam_answer_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  item_index integer NOT NULL,
  answer jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_answer_events_attempt_idx ON public.exam_answer_events (attempt_id, at);
GRANT ALL ON public.exam_answer_events TO service_role;
ALTER TABLE public.exam_answer_events ENABLE ROW LEVEL SECURITY;
