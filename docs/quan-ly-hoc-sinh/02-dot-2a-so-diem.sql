-- Quản lý học sinh · Đợt 2a: sổ điểm cá nhân (mỗi lớp – môn – học kỳ một sổ), điểm cộng/trừ
-- riêng có lịch sử, và ghi nhận quá trình học tập trên lớp (phát biểu, lên bảng…).
-- Áp dụng qua Lovable, không đặt vào drizzle/ bằng tay. Như đợt 1: chỉ service_role, mọi
-- đọc/ghi qua server functions (src/lib/gradebook/) sau khi kiểm tra lớp thuộc giáo viên.

CREATE TABLE public.gb_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 60),
  semester smallint NOT NULL CHECK (semester IN (1, 2)),
  school_year text NOT NULL DEFAULT '' CHECK (char_length(school_year) <= 20),
  columns jsonb NOT NULL,
  bonus_target text CHECK (bonus_target IS NULL OR char_length(bonus_target) <= 20),
  bonus_rule jsonb,
  -- file Excel SMAS gốc (base64) và vị trí dòng/cột để xuất ngược lại đúng file đó
  smas_template text CHECK (smas_template IS NULL OR char_length(smas_template) <= 3000000),
  smas_map jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject, semester)
);
CREATE INDEX gb_books_owner_idx ON public.gb_books (owner_id);
GRANT ALL ON public.gb_books TO service_role;
ALTER TABLE public.gb_books ENABLE ROW LEVEL SECURITY;

-- Một ô điểm: num cho cột điểm số, txt cho Đ/CĐ hoặc nhận xét. Ô trống = không có dòng.
CREATE TABLE public.gb_scores (
  book_id uuid NOT NULL REFERENCES public.gb_books(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  column_key text NOT NULL CHECK (column_key ~ '^[a-z0-9_]{1,20}$'),
  num numeric(4, 2) CHECK (num IS NULL OR (num >= 0 AND num <= 10)),
  txt text CHECK (txt IS NULL OR char_length(txt) <= 255),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, student_id, column_key)
);
CREATE INDEX gb_scores_student_idx ON public.gb_scores (student_id);
GRANT ALL ON public.gb_scores TO service_role;
ALTER TABLE public.gb_scores ENABLE ROW LEVEL SECURITY;

-- Cột "Điểm cộng" và "Điểm trừ" của từng học sinh trong một sổ (giáo viên nhập tùy ý).
CREATE TABLE public.gb_bonus (
  book_id uuid NOT NULL REFERENCES public.gb_books(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  plus numeric(4, 2) NOT NULL DEFAULT 0 CHECK (plus >= 0 AND plus <= 10),
  minus numeric(4, 2) NOT NULL DEFAULT 0 CHECK (minus >= 0 AND minus <= 10),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, student_id)
);
CREATE INDEX gb_bonus_student_idx ON public.gb_bonus (student_id);
GRANT ALL ON public.gb_bonus TO service_role;
ALTER TABLE public.gb_bonus ENABLE ROW LEVEL SECURITY;

-- Lịch sử mỗi lần sửa điểm cộng/trừ (giá trị cũ → mới, lý do).
CREATE TABLE public.gb_bonus_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.gb_books(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plus_old numeric(4, 2) NOT NULL,
  plus_new numeric(4, 2) NOT NULL,
  minus_old numeric(4, 2) NOT NULL,
  minus_new numeric(4, 2) NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gb_bonus_log_book_student_idx ON public.gb_bonus_log (book_id, student_id, at);
CREATE INDEX gb_bonus_log_student_idx ON public.gb_bonus_log (student_id);
GRANT ALL ON public.gb_bonus_log TO service_role;
ALTER TABLE public.gb_bonus_log ENABLE ROW LEVEL SECURITY;

-- Ghi nhận trên lớp: mỗi lần chạm "Phát biểu", "Không làm bài tập"… là một dòng.
-- Dùng cho gợi ý điểm cộng của sổ điểm và (đợt sau) xếp loại thi đua tuần của GVCN.
CREATE TABLE public.hr_behavior_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,30}$'),
  subject text NOT NULL DEFAULT '' CHECK (char_length(subject) <= 60),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_behavior_events_class_day_idx ON public.hr_behavior_events (class_id, day);
CREATE INDEX hr_behavior_events_student_idx ON public.hr_behavior_events (student_id);
CREATE INDEX hr_behavior_events_owner_idx ON public.hr_behavior_events (owner_id);
GRANT ALL ON public.hr_behavior_events TO service_role;
ALTER TABLE public.hr_behavior_events ENABLE ROW LEVEL SECURITY;
