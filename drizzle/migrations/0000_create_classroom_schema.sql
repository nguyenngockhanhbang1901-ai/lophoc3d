CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  lesson_key text NOT NULL,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, lesson_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read lessons" ON public.lessons FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners create lessons" ON public.lessons FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update lessons" ON public.lessons FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners delete lessons" ON public.lessons FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL,
  code text NOT NULL UNIQUE,
  team_count integer NOT NULL CHECK (team_count BETWEEN 1 AND 10),
  lesson_key text NOT NULL DEFAULT '12',
  lesson_mode text NOT NULL DEFAULT 'default' CHECK (lesson_mode IN ('default','lecture','presentation')),
  lesson_title text NOT NULL DEFAULT '',
  lesson_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed boolean NOT NULL DEFAULT false,
  current_activity integer NOT NULL DEFAULT 1 CHECK (current_activity BETWEEN 1 AND 5),
  current_step integer NOT NULL DEFAULT 0,
  presentation_step integer NOT NULL DEFAULT 0,
  presentation_review boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  activity2_started_at timestamptz,
  practice1_started_at timestamptz,
  photo_started_at timestamptz,
  activity3_started_at timestamptz,
  answers_visible boolean NOT NULL DEFAULT false,
  correct_visible boolean NOT NULL DEFAULT false,
  activity1_answers_visible boolean NOT NULL DEFAULT false,
  practice1_answers_visible boolean NOT NULL DEFAULT false,
  photo_answers_visible boolean NOT NULL DEFAULT false,
  activity3_answers_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classrooms_owner_idx ON public.classrooms (owner_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classrooms TO authenticated;
GRANT ALL ON public.classrooms TO service_role;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read classrooms" ON public.classrooms FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners create classrooms" ON public.classrooms FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update classrooms" ON public.classrooms FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners delete classrooms" ON public.classrooms FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.classroom_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  number integer NOT NULL,
  access_hash text NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  step integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  timings jsonb NOT NULL DEFAULT '[]'::jsonb,
  goal_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  goal_step integer NOT NULL DEFAULT 0,
  goal_timings jsonb NOT NULL DEFAULT '[]'::jsonb,
  goal_completed_at timestamptz,
  goal_revision integer NOT NULL DEFAULT 0,
  practice_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  practice_step integer NOT NULL DEFAULT 0,
  practice_timings jsonb NOT NULL DEFAULT '[]'::jsonb,
  practice_completed_at timestamptz,
  practice_revision integer NOT NULL DEFAULT 0,
  photo_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_step integer NOT NULL DEFAULT 0,
  photo_completed_at timestamptz,
  activity3_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  activity3_step integer NOT NULL DEFAULT 0,
  activity3_completed_at timestamptz,
  UNIQUE (classroom_id, number)
);
GRANT SELECT ON public.classroom_teams TO authenticated;
GRANT ALL ON public.classroom_teams TO service_role;
ALTER TABLE public.classroom_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room owners read teams" ON public.classroom_teams FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid()));

CREATE TABLE public.lesson111_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  slot integer NOT NULL,
  access_hash text NOT NULL,
  name text,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz,
  UNIQUE (classroom_id, slot)
);
GRANT SELECT ON public.lesson111_students TO authenticated;
GRANT ALL ON public.lesson111_students TO service_role;
ALTER TABLE public.lesson111_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room owners read students" ON public.lesson111_students FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.owner_id = auth.uid()));

-- Releases one lesson part now (keeps an earlier release; replaces a future scheduled one).
CREATE OR REPLACE FUNCTION public.begin_classroom_activity(room_id uuid, activity integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF activity = 1 THEN
    UPDATE classrooms SET started_at = CASE WHEN started_at IS NULL OR started_at > now() THEN now() ELSE started_at END
      WHERE id = room_id AND owner_id = auth.uid() AND NOT closed RETURNING started_at INTO result;
  ELSIF activity = 2 THEN
    UPDATE classrooms SET activity2_started_at = CASE WHEN activity2_started_at IS NULL OR activity2_started_at > now() THEN now() ELSE activity2_started_at END
      WHERE id = room_id AND owner_id = auth.uid() AND NOT closed RETURNING activity2_started_at INTO result;
  ELSIF activity = 3 THEN
    UPDATE classrooms SET practice1_started_at = CASE WHEN practice1_started_at IS NULL OR practice1_started_at > now() THEN now() ELSE practice1_started_at END
      WHERE id = room_id AND owner_id = auth.uid() AND NOT closed RETURNING practice1_started_at INTO result;
  ELSIF activity = 4 THEN
    UPDATE classrooms SET photo_started_at = CASE WHEN photo_started_at IS NULL OR photo_started_at > now() THEN now() ELSE photo_started_at END
      WHERE id = room_id AND owner_id = auth.uid() AND NOT closed RETURNING photo_started_at INTO result;
  ELSIF activity = 5 THEN
    UPDATE classrooms SET activity3_started_at = CASE WHEN activity3_started_at IS NULL OR activity3_started_at > now() THEN now() ELSE activity3_started_at END
      WHERE id = room_id AND owner_id = auth.uid() AND NOT closed RETURNING activity3_started_at INTO result;
  ELSE
    RAISE EXCEPTION 'invalid activity';
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.begin_classroom_assignment(room_id uuid)
RETURNS timestamptz LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.begin_classroom_activity(room_id, 1);
$$;

CREATE OR REPLACE FUNCTION public.set_classroom_activity(room_id uuid, activity integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF activity < 1 OR activity > 5 THEN RAISE EXCEPTION 'invalid activity'; END IF;
  UPDATE classrooms SET current_activity = activity
    WHERE id = room_id AND owner_id = auth.uid() RETURNING current_activity INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.begin_classroom_activity(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.begin_classroom_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_classroom_activity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_classroom_activity(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_classroom_assignment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_classroom_activity(uuid, integer) TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.classrooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_teams;