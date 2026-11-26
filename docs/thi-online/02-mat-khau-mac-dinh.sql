-- Thi online · Mật khẩu mặc định của lớp và mật khẩu giáo viên xem được.
-- Mật khẩu vẫn được băm (password_hash) để đăng nhập; bản mã hóa AES-GCM (password_enc) chỉ
-- để giáo viên xem lại, khóa giải mã nằm ở máy chủ, không nằm trong cơ sở dữ liệu.

ALTER TABLE public.exam_classes
  ADD COLUMN default_password_enc text CHECK (default_password_enc IS NULL OR char_length(default_password_enc) <= 400);

ALTER TABLE public.exam_students
  ADD COLUMN password_enc text CHECK (password_enc IS NULL OR char_length(password_enc) <= 400),
  ADD COLUMN password_by_student boolean NOT NULL DEFAULT false;
