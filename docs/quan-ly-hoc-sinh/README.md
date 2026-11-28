# Quản lý học sinh (GVCN) — các bước áp dụng cơ sở dữ liệu

Dự án để Lovable quản lý cơ sở dữ liệu, nên mỗi đợt có một file SQL ở thư mục này.
Sau khi gộp code, dán lời nhắn dưới đây vào Lovable để tạo bảng.

## Đợt 1: lớp chủ nhiệm, hồ sơ, người giám hộ, điểm danh

> Hãy tạo migration mới với đúng nội dung SQL trong file `docs/quan-ly-hoc-sinh/01-dot-1-co-ban.sql`
> (bảng hr_class_settings, hr_student_profiles, hr_guardians, hr_attendance_days, hr_absences;
> chỉ cấp quyền cho service_role, bật RLS). Không sửa code giao diện hay server functions.
> Sau khi tạo xong, cập nhật lại types của Supabase.

Học sinh dùng chung bảng `exam_students` với tài khoản thi online. Mọi đọc/ghi đi qua
server functions trong `src/lib/homeroom/` sau khi kiểm tra lớp thuộc giáo viên đang đăng nhập.

Trang mới: `/chu-nhiem` (tổng quan), `/chu-nhiem/ho-so`, `/chu-nhiem/diem-danh`, `/chu-nhiem/chuyen-can`.

## Đợt 2a: sổ điểm cá nhân, điểm cộng/trừ, ghi nhận trên lớp

> Hãy tạo migration mới với đúng nội dung SQL trong file `docs/quan-ly-hoc-sinh/02-dot-2a-so-diem.sql`
> (bảng gb_books, gb_scores, gb_bonus, gb_bonus_log, hr_behavior_events; chỉ cấp quyền cho
> service_role, bật RLS, không thêm policy). Không sửa code giao diện hay server functions.
> Sau khi tạo xong, cập nhật lại types của Supabase.

Trang mới: `/so-diem`. File SMAS (Sổ điểm → Xuất Excel) được đọc và lưu cùng sổ; “Xuất file SMAS”
trả lại đúng file đó đã điền điểm (điểm sau cộng/trừ), giữ nguyên mã ẩn và công thức để nhập lại SMAS.
