CREATE TABLE public.lesson_ai_prepared (
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  question_key text NOT NULL,
  answer text NOT NULL CHECK (char_length(answer) <= 20000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, question_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_ai_prepared TO authenticated;
GRANT ALL ON public.lesson_ai_prepared TO service_role;
ALTER TABLE public.lesson_ai_prepared ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers read their prepared answers" ON public.lesson_ai_prepared FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Teachers add their prepared answers" ON public.lesson_ai_prepared FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers change their prepared answers" ON public.lesson_ai_prepared FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Teachers remove their prepared answers" ON public.lesson_ai_prepared FOR DELETE TO authenticated USING (owner_id = auth.uid());