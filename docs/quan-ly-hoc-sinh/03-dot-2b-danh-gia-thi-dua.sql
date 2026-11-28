-- Quản lý học sinh · Đợt 2b: khen thưởng – vi phạm, xếp loại thi đua tuần, đánh giá học kỳ/cả năm,
-- nhật ký trao đổi với phụ huynh. Áp dụng qua Lovable, không đặt vào drizzle/ bằng tay.
-- Như các đợt trước: chỉ service_role, mọi đọc/ghi qua server functions sau khi kiểm tra lớp.

-- Bảng điểm thi đua tuần của lớp (null = dùng mặc định trong code).
ALTER TABLE public.hr_class_settings ADD COLUMN weekly_rule jsonb;

-- Khen thưởng và vi phạm: mỗi sự kiện có ngày, nội dung, biện pháp/hình thức và điểm thi đua.
CREATE TABLE public.hr_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  type text NOT NULL CHECK (type IN ('khen', 'vi_pham')),
  category text NOT NULL CHECK (category ~ '^[a-z_]{2,30}$'),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  action text NOT NULL DEFAULT '' CHECK (char_length(action) <= 300),
  points integer NOT NULL DEFAULT 0 CHECK (points BETWEEN -100 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_incidents_class_day_idx ON public.hr_incidents (class_id, day);
CREATE INDEX hr_incidents_student_idx ON public.hr_incidents (student_id);
CREATE INDEX hr_incidents_owner_idx ON public.hr_incidents (owner_id);
GRANT ALL ON public.hr_incidents TO service_role;
ALTER TABLE public.hr_incidents ENABLE ROW LEVEL SECURITY;

-- Kết quả xếp loại tuần đã chốt (điểm thi đua và mức GVCN xác nhận).
CREATE TABLE public.hr_weekly_results (
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  points integer NOT NULL,
  level text NOT NULL CHECK (level IN ('tot', 'kha', 'dat', 'chua_dat')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  locked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id, week_start)
);
CREATE INDEX hr_weekly_results_student_idx ON public.hr_weekly_results (student_id);
CREATE INDEX hr_weekly_results_owner_idx ON public.hr_weekly_results (owner_id);
GRANT ALL ON public.hr_weekly_results TO service_role;
ALTER TABLE public.hr_weekly_results ENABLE ROW LEVEL SECURITY;

-- Đánh giá của GVCN theo học kỳ (1, 2) và cả năm (3): mức học tập, mức rèn luyện, nhận xét.
CREATE TABLE public.hr_evaluations (
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term smallint NOT NULL CHECK (term IN (1, 2, 3)),
  study_level text CHECK (study_level IS NULL OR study_level IN ('tot', 'kha', 'dat', 'chua_dat')),
  conduct_level text CHECK (conduct_level IS NULL OR conduct_level IN ('tot', 'kha', 'dat', 'chua_dat')),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id, term)
);
CREATE INDEX hr_evaluations_student_idx ON public.hr_evaluations (student_id);
CREATE INDEX hr_evaluations_owner_idx ON public.hr_evaluations (owner_id);
GRANT ALL ON public.hr_evaluations TO service_role;
ALTER TABLE public.hr_evaluations ENABLE ROW LEVEL SECURITY;

-- Nhật ký trao đổi với phụ huynh.
CREATE TABLE public.hr_parent_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  guardian_name text NOT NULL DEFAULT '' CHECK (char_length(guardian_name) <= 100),
  channel text NOT NULL CHECK (channel IN ('dien_thoai', 'zalo', 'gap_mat', 'hop_phu_huynh', 'khac')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  result text NOT NULL DEFAULT '' CHECK (char_length(result) <= 1000),
  follow_up date,
  follow_up_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_parent_contacts_class_day_idx ON public.hr_parent_contacts (class_id, day);
CREATE INDEX hr_parent_contacts_student_idx ON public.hr_parent_contacts (student_id);
CREATE INDEX hr_parent_contacts_owner_idx ON public.hr_parent_contacts (owner_id);
GRANT ALL ON public.hr_parent_contacts TO service_role;
ALTER TABLE public.hr_parent_contacts ENABLE ROW LEVEL SECURITY;
