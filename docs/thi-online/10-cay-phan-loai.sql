-- Thi online · Cây phân loại câu hỏi kiểu OLM: Khối → Chương → Bài → Dạng toán.
-- Khối, chương, bài nằm ở exam_topics; mỗi dạng toán là một ngân hàng (exam_banks) gắn vào một
-- bài qua topic_id. Ngân hàng cũ có topic_id rỗng = "Chưa phân loại". Giáo viên tự dựng cây.

CREATE TABLE public.exam_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.exam_topics(id) ON DELETE NO ACTION,
  level text NOT NULL CHECK (level IN ('grade', 'chapter', 'lesson')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((level = 'grade') = (parent_id IS NULL))
);
CREATE INDEX exam_topics_owner_idx ON public.exam_topics (owner_id, position);
CREATE INDEX exam_topics_parent_idx ON public.exam_topics (parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_topics TO authenticated;
GRANT ALL ON public.exam_topics TO service_role;
ALTER TABLE public.exam_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their topics" ON public.exam_topics
  FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));
CREATE POLICY "Teachers add their topics" ON public.exam_topics
  FOR INSERT TO authenticated WITH CHECK (
    owner_id = (select auth.uid())
    AND (parent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.exam_topics p WHERE p.id = parent_id AND p.owner_id = (select auth.uid())))
  );
CREATE POLICY "Teachers change their topics" ON public.exam_topics
  FOR UPDATE TO authenticated USING (owner_id = (select auth.uid()))
  WITH CHECK (
    owner_id = (select auth.uid())
    AND (parent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.exam_topics p WHERE p.id = parent_id AND p.owner_id = (select auth.uid())))
  );
CREATE POLICY "Teachers remove their topics" ON public.exam_topics
  FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

ALTER TABLE public.exam_banks
  ADD COLUMN topic_id uuid REFERENCES public.exam_topics(id) ON DELETE NO ACTION,
  ADD COLUMN position integer NOT NULL DEFAULT 0;
CREATE INDEX exam_banks_topic_idx ON public.exam_banks (topic_id, position);
