CREATE TABLE public.lesson_ai_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  answer text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, question_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_ai_solutions TO authenticated;
GRANT ALL ON public.lesson_ai_solutions TO service_role;
ALTER TABLE public.lesson_ai_solutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room owners read AI solutions" ON public.lesson_ai_solutions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid()));
CREATE POLICY "Room owners save AI solutions" ON public.lesson_ai_solutions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid()));
CREATE POLICY "Room owners replace AI solutions" ON public.lesson_ai_solutions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid()));
CREATE POLICY "Room owners delete AI solutions" ON public.lesson_ai_solutions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid()));