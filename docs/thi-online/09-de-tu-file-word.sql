-- Thi online · Giai đoạn 11: tạo đề thi trực tiếp từ file Word.
-- Câu hỏi của đề Word nằm trong một ngân hàng ẩn (purpose = 'word_exam'), không hiện ở
-- Ngân hàng đề; đề là một ma trận ẩn có mỗi vị trí ghim đúng một câu. Thêm tùy chọn đảo thứ tự
-- 4 ý a–d của câu đúng/sai (cho cả ma trận thường).

ALTER TABLE public.exam_banks
  ADD COLUMN purpose text NOT NULL DEFAULT 'bank' CHECK (purpose IN ('bank', 'word_exam'));

ALTER TABLE public.exam_matrices
  ADD COLUMN purpose text NOT NULL DEFAULT 'bank' CHECK (purpose IN ('bank', 'word_exam')),
  ADD COLUMN source_file text NOT NULL DEFAULT '' CHECK (char_length(source_file) <= 200),
  ADD COLUMN source_bank_id uuid REFERENCES public.exam_banks(id) ON DELETE SET NULL,
  ADD COLUMN shuffle_statements boolean NOT NULL DEFAULT false;
CREATE INDEX exam_matrices_source_bank_idx ON public.exam_matrices (source_bank_id);

ALTER TABLE public.exam_assignments
  ADD COLUMN shuffle_statements boolean NOT NULL DEFAULT false;
