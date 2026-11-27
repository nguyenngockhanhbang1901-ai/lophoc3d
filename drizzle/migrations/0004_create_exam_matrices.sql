-- Thi online · Giai đoạn 4: ma trận đề.
-- Một ma trận là danh sách vị trí câu (ngân hàng nguồn, dạng câu, mức độ, điểm), lưu dạng jsonb
-- và luôn được kiểm tra bằng matrixSlotsSchema trong code. Mỗi học sinh được rút một câu cho
-- mỗi vị trí (giai đoạn 5); ở đây giáo viên tạo, sửa và xem thử.

CREATE TABLE public.exam_matrices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  slots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slots) = 'array' AND jsonb_array_length(slots) <= 200),
  shuffle_options boolean NOT NULL DEFAULT true,
  shuffle_order boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_matrices_owner_idx ON public.exam_matrices (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_matrices TO authenticated;
GRANT ALL ON public.exam_matrices TO service_role;
ALTER TABLE public.exam_matrices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their matrices" ON public.exam_matrices FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Teachers add their matrices" ON public.exam_matrices FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers change their matrices" ON public.exam_matrices FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers remove their matrices" ON public.exam_matrices FOR DELETE TO authenticated USING (owner_id = auth.uid());