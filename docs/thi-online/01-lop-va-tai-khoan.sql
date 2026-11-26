-- Thi online · Giai đoạn 1–2: lớp học, tài khoản học sinh, phiên đăng nhập, nhật ký đăng nhập.
-- Áp dụng qua Lovable (dự án quản lý schema), không đặt vào drizzle/ bằng tay.
-- Học sinh KHÔNG dùng Supabase Auth: tài khoản và phiên do server functions quản lý,
-- nên bảng học sinh/phiên/nhật ký không cấp quyền cho anon/authenticated (chỉ service_role).

CREATE TABLE public.exam_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  school_year text NOT NULL DEFAULT '' CHECK (char_length(school_year) <= 20),
  subject text NOT NULL DEFAULT '' CHECK (char_length(subject) <= 60),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_classes_owner_idx ON public.exam_classes (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_classes TO authenticated;
GRANT ALL ON public.exam_classes TO service_role;
ALTER TABLE public.exam_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their exam classes" ON public.exam_classes FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Teachers add their exam classes" ON public.exam_classes FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers change their exam classes" ON public.exam_classes FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers remove their exam classes" ON public.exam_classes FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.exam_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 100),
  birth_date date,
  student_code text CHECK (student_code IS NULL OR char_length(student_code) <= 30),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9]{3,32}$'),
  password_hash text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  password_set_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_students_class_idx ON public.exam_students (class_id);
CREATE INDEX exam_students_owner_idx ON public.exam_students (owner_id);
GRANT ALL ON public.exam_students TO service_role;
ALTER TABLE public.exam_students ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exam_student_sessions (
  token_hash text PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  user_agent text NOT NULL DEFAULT '' CHECK (char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX exam_student_sessions_student_idx ON public.exam_student_sessions (student_id);
GRANT ALL ON public.exam_student_sessions TO service_role;
ALTER TABLE public.exam_student_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exam_login_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.exam_students(id) ON DELETE CASCADE,
  username text NOT NULL CHECK (char_length(username) <= 64),
  success boolean NOT NULL,
  user_agent text NOT NULL DEFAULT '' CHECK (char_length(user_agent) <= 300),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_login_logs_student_idx ON public.exam_login_logs (student_id, at DESC);
CREATE INDEX exam_login_logs_username_idx ON public.exam_login_logs (username, at DESC);
GRANT ALL ON public.exam_login_logs TO service_role;
ALTER TABLE public.exam_login_logs ENABLE ROW LEVEL SECURITY;
