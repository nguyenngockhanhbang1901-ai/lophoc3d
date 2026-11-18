ALTER TABLE public.classrooms ADD COLUMN quiz_started_at timestamptz;
ALTER TABLE public.classrooms ADD COLUMN quiz_answers_visible boolean NOT NULL DEFAULT false;
ALTER TABLE public.classrooms DROP CONSTRAINT IF EXISTS classrooms_current_activity_check;
ALTER TABLE public.classrooms ADD CONSTRAINT classrooms_current_activity_check CHECK (current_activity BETWEEN 1 AND 6);
ALTER TABLE public.classroom_teams ADD COLUMN quiz_answers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.classroom_teams ADD COLUMN quiz_step integer NOT NULL DEFAULT 0;
ALTER TABLE public.classroom_teams ADD COLUMN quiz_timings jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.classroom_teams ADD COLUMN quiz_completed_at timestamptz;
ALTER TABLE public.classroom_teams ADD COLUMN quiz_revision integer NOT NULL DEFAULT 0;

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
  ELSIF activity = 6 THEN
    UPDATE classrooms SET quiz_started_at = CASE WHEN quiz_started_at IS NULL OR quiz_started_at > now() THEN now() ELSE quiz_started_at END
      WHERE id = room_id AND owner_id = auth.uid() AND NOT closed RETURNING quiz_started_at INTO result;
  ELSE
    RAISE EXCEPTION 'invalid activity';
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.set_classroom_activity(room_id uuid, activity integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF activity < 1 OR activity > 6 THEN RAISE EXCEPTION 'invalid activity'; END IF;
  UPDATE classrooms SET current_activity = activity
    WHERE id = room_id AND owner_id = auth.uid() RETURNING current_activity INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.begin_classroom_activity(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_classroom_activity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_classroom_activity(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_classroom_activity(uuid, integer) TO authenticated, service_role;