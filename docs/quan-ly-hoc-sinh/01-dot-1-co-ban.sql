-- Quản lý học sinh (giáo viên chủ nhiệm) · Đợt 1: lớp chủ nhiệm, hồ sơ, người giám hộ, điểm danh.
-- Áp dụng qua Lovable (dự án quản lý schema), không đặt vào drizzle/ bằng tay.
-- Học sinh dùng chung bảng exam_students (cùng tài khoản thi online), nên mọi bảng ở đây
-- chỉ cấp quyền cho service_role: server functions trong src/lib/homeroom/ kiểm tra lớp thuộc
-- giáo viên đang đăng nhập rồi mới đọc/ghi. Trình duyệt không đọc trực tiếp dữ liệu cá nhân.

-- Một lớp (exam_classes) trở thành lớp chủ nhiệm khi có một dòng ở đây.
CREATE TABLE public.hr_class_settings (
  class_id uuid PRIMARY KEY REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_start date,
  term2_start date,
  year_end date,
  two_sessions boolean NOT NULL DEFAULT false,
  alert_consecutive integer NOT NULL DEFAULT 3 CHECK (alert_consecutive BETWEEN 1 AND 30),
  alert_unexcused_month integer NOT NULL DEFAULT 2 CHECK (alert_unexcused_month BETWEEN 1 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (term2_start IS NULL OR year_start IS NULL OR term2_start > year_start),
  CHECK (year_end IS NULL OR term2_start IS NULL OR year_end > term2_start)
);
CREATE INDEX hr_class_settings_owner_idx ON public.hr_class_settings (owner_id);
GRANT ALL ON public.hr_class_settings TO service_role;
ALTER TABLE public.hr_class_settings ENABLE ROW LEVEL SECURITY;

-- Hồ sơ mở rộng của từng học sinh (họ tên, ngày sinh, mã học sinh vẫn ở exam_students).
CREATE TABLE public.hr_student_profiles (
  student_id uuid PRIMARY KEY REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gender text CHECK (gender IS NULL OR gender IN ('nam', 'nu')),
  ethnicity text NOT NULL DEFAULT '' CHECK (char_length(ethnicity) <= 30),
  permanent_address text NOT NULL DEFAULT '' CHECK (char_length(permanent_address) <= 200),
  current_address text NOT NULL DEFAULT '' CHECK (char_length(current_address) <= 200),
  class_role text NOT NULL DEFAULT '' CHECK (char_length(class_role) <= 50),
  group_name text NOT NULL DEFAULT '' CHECK (char_length(group_name) <= 30),
  seat text NOT NULL DEFAULT '' CHECK (char_length(seat) <= 10),
  care_note text NOT NULL DEFAULT '' CHECK (char_length(care_note) <= 300),
  private_note text NOT NULL DEFAULT '' CHECK (char_length(private_note) <= 2000),
  photo text CHECK (photo IS NULL OR char_length(photo) <= 60000),
  status text NOT NULL DEFAULT 'dang_hoc'
    CHECK (status IN ('dang_hoc', 'chuyen_den', 'chuyen_di', 'nghi_hoc')),
  status_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_student_profiles_owner_idx ON public.hr_student_profiles (owner_id);
GRANT ALL ON public.hr_student_profiles TO service_role;
ALTER TABLE public.hr_student_profiles ENABLE ROW LEVEL SECURITY;

-- Cha, mẹ, người giám hộ: nhiều người cho một học sinh, một người liên hệ chính.
CREATE TABLE public.hr_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 100),
  relation text NOT NULL DEFAULT '' CHECK (char_length(relation) <= 30),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 20),
  zalo text NOT NULL DEFAULT '' CHECK (char_length(zalo) <= 20),
  is_primary boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_guardians_student_idx ON public.hr_guardians (student_id, position);
GRANT ALL ON public.hr_guardians TO service_role;
ALTER TABLE public.hr_guardians ENABLE ROW LEVEL SECURITY;

-- Buổi đã điểm danh (để biết hôm nay đã điểm danh chưa và tính "nghỉ liên tiếp").
-- session: ca_ngay khi lớp học một buổi; sang/chieu khi lớp học hai buổi.
CREATE TABLE public.hr_attendance_days (
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  session text NOT NULL DEFAULT 'ca_ngay' CHECK (session IN ('ca_ngay', 'sang', 'chieu')),
  taken_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, day, session)
);
GRANT ALL ON public.hr_attendance_days TO service_role;
ALTER TABLE public.hr_attendance_days ENABLE ROW LEVEL SECURITY;

-- Chỉ lưu học sinh vắng hoặc đi muộn; không có dòng = có mặt.
CREATE TABLE public.hr_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.exam_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.exam_students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  session text NOT NULL DEFAULT 'ca_ngay' CHECK (session IN ('ca_ngay', 'sang', 'chieu')),
  kind text NOT NULL CHECK (kind IN ('co_phep', 'khong_phep', 'di_muon')),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, day, session)
);
CREATE INDEX hr_absences_class_day_idx ON public.hr_absences (class_id, day);
GRANT ALL ON public.hr_absences TO service_role;
ALTER TABLE public.hr_absences ENABLE ROW LEVEL SECURITY;
