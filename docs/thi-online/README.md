# Thi online — các bước áp dụng cơ sở dữ liệu

Dự án để Lovable quản lý cơ sở dữ liệu, nên mỗi giai đoạn có một file SQL ở thư mục này.
Sau khi gộp code, dán lời nhắn dưới đây vào Lovable để tạo bảng.

## Giai đoạn 1–2: lớp và tài khoản học sinh

> Hãy tạo migration mới với đúng nội dung SQL trong file `docs/thi-online/01-lop-va-tai-khoan.sql`
> (bảng exam_classes, exam_students, exam_student_sessions, exam_login_logs và các chính sách RLS).
> Không sửa code giao diện hay server functions. Sau khi tạo xong, cập nhật lại types của Supabase.

Học sinh không dùng Supabase Auth: tài khoản, mật khẩu (băm PBKDF2) và phiên đăng nhập do
server functions trong `src/lib/exam/` quản lý; chỉ service_role đọc được các bảng học sinh.

## Mật khẩu mặc định của lớp

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/02-mat-khau-mac-dinh.sql`
> (thêm cột default_password_enc cho exam_classes; password_enc và password_by_student cho exam_students),
> rồi cập nhật lại types. Không sửa code khác.

## Giai đoạn 3: ngân hàng đề

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/03-ngan-hang-de.sql`
> (bảng exam_banks, exam_questions và chính sách RLS), rồi cập nhật lại types. Không sửa code khác.

## Giai đoạn 4: ma trận đề

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/04-ma-tran-de.sql`
> (bảng exam_matrices và chính sách RLS), rồi cập nhật lại types. Không sửa code khác.

## Giai đoạn 5–6: giao bài và làm bài

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/05-giao-bai-va-lam-bai.sql`
> (bảng exam_assignments, exam_attempts, exam_answers, exam_answer_events, chỉ mục và RLS),
> rồi cập nhật lại types. Không sửa code khác.

## Giai đoạn 7: chống gian lận

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/06-chong-gian-lan.sql`
> (thêm cột last_heartbeat_at, session_hash, edit_warned_at, edit_count cho exam_attempts;
> bảng exam_violations, exam_connection_events và RLS), rồi cập nhật lại types. Không sửa code khác.

## Giai đoạn 8: quyền thi lại và thông báo

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/07-quyen-thi-lai-va-thong-bao.sql`
> (bảng exam_retake_grants, exam_notifications, RLS và hai chỉ mục cho exam_connection_events),
> rồi cập nhật lại types. Không sửa code khác.

## Giai đoạn 10: giao bài giảng cho lớp

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/08-giao-bai-giang.sql`
> (bảng exam_lesson_assignments, exam_lesson_views, thêm loại thông báo new_lesson), rồi cập nhật lại types.
> Không sửa code khác.

## Giai đoạn 11: tạo đề thi từ file Word

> Hãy tạo migration mới với đúng SQL trong `docs/thi-online/09-de-tu-file-word.sql`
> (cột purpose cho exam_banks và exam_matrices, source_file, source_bank_id, shuffle_statements),
> rồi cập nhật lại types. Không sửa code khác.
