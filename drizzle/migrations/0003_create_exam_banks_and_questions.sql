-- Thi online · Giai đoạn 3: thư viện đề (ngân hàng câu hỏi) soạn tay.
-- Mỗi ngân hàng là một nhóm câu tương đương nhau; ma trận đề sẽ rút câu từ đây.
-- Giáo viên đọc/sửa trực tiếp qua RLS (chỉ dữ liệu của mình). Học sinh không bao giờ đọc bảng
-- này: đề thi được máy chủ gửi từng câu, không kèm đáp án.

CREATE TABLE public.exam_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
  topic text NOT NULL DEFAULT '' CHECK (char_length(topic) <= 150),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_banks_owner_idx ON public.exam_banks (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_banks TO authenticated;
GRANT ALL ON public.exam_banks TO service_role;
ALTER TABLE public.exam_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their banks" ON public.exam_banks FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Teachers add their banks" ON public.exam_banks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers change their banks" ON public.exam_banks FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers remove their banks" ON public.exam_banks FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES public.exam_banks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('mcq', 'tf', 'short')),
  level text NOT NULL DEFAULT 'nb' CHECK (level IN ('nb', 'th', 'vd', 'vdc')),
  topic text NOT NULL DEFAULT '' CHECK (char_length(topic) <= 150),
  body jsonb NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pg_column_size(body) <= 600000)
);
CREATE INDEX exam_questions_bank_idx ON public.exam_questions (bank_id, position);
CREATE INDEX exam_questions_owner_idx ON public.exam_questions (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO authenticated;
GRANT ALL ON public.exam_questions TO service_role;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their questions" ON public.exam_questions FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Teachers add their questions" ON public.exam_questions FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.exam_banks b WHERE b.id = bank_id AND b.owner_id = auth.uid()));
CREATE POLICY "Teachers change their questions" ON public.exam_questions FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.exam_banks b WHERE b.id = bank_id AND b.owner_id = auth.uid()));
CREATE POLICY "Teachers remove their questions" ON public.exam_questions FOR DELETE TO authenticated USING (owner_id = auth.uid());