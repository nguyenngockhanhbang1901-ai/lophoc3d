import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireOwner } from '@/lib/owner-middleware';
import { classroomCodeSchema, codeJoinKey } from './classroom-access';
import { assignmentStarted } from './assignment';
import { MAX_CUBE_STUDENTS, scheduledReleaseError } from './cube-practice';
import { reconcileSteps, submitStep, type StepProgress } from './goal-progress';
import { isQuizLetter, QUIZ_STEPS } from './quiz-race';
import { QUIZ_SOLO_LESSON_KEY, readSoloProgress, type SoloStored } from './quiz-solo';

// Bài 12.1 shares the per-student slot table with Bài 11.1, but every function here checks lesson_key = '12.1',
// so neither lesson can read or write the other's classes.
const credential = classroomCodeSchema.extend({ slot: z.number().int().min(1).max(MAX_CUBE_STUDENTS), key: z.string().length(24) });
export type QuizSoloAccess = z.infer<typeof credential>;
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

async function verify(data: QuizSoloAccess) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: room } = await supabaseAdmin.from('classrooms').select('id,closed,started_at,lesson_key').eq('code', data.code).maybeSingle();
  if (!room || room.lesson_key !== QUIZ_SOLO_LESSON_KEY) throw new Error('Mã lớp không đúng');
  const { data: student } = await supabaseAdmin.from('lesson111_students').select().eq('classroom_id', room.id).eq('slot', data.slot).maybeSingle();
  if (!student?.name || data.key !== await codeJoinKey(room.id, student.access_hash)) throw new Error('Thông tin tham gia không hợp lệ');
  return { supabaseAdmin, room, student };
}

const plain = (p: StepProgress) => ({ answers: p.answers, step: p.step, completedAt: p.completedAt, timings: p.timings });
/** Writes only if nobody else changed the row since it was read (rev check); returns what is now stored. */
async function persist(admin: Admin, id: string, before: SoloStored, next: StepProgress): Promise<SoloStored> {
  if (JSON.stringify(plain(before)) === JSON.stringify(plain(next))) return before;
  const stored: SoloStored = { ...plain(next), rev: before.rev + 1 };
  let query = admin.from('lesson111_students').update({ answers: stored, submitted_at: next.completedAt }).eq('id', id);
  query = before.rev === 0 ? query.is('answers->>rev', null) : query.eq('answers->>rev', String(before.rev));
  const { data: saved, error } = await query.select('answers').maybeSingle();
  if (saved) return readSoloProgress(saved.answers);
  if (error) throw new Error('Không lưu được bài làm');
  // Lost a race with another request from the same student: use what that request stored.
  const { data: latest } = await admin.from('lesson111_students').select('answers').eq('id', id).single();
  return readSoloProgress(latest?.answers);
}

export const joinQuizSolo = createServerFn({ method: 'POST' }).inputValidator(classroomCodeSchema.extend({ name: z.string().trim().min(2).max(100) })).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: room } = await supabaseAdmin.from('classrooms').select('id,closed,lesson_key,lesson_title').eq('code', data.code).maybeSingle();
  if (!room || room.closed || room.lesson_key !== QUIZ_SOLO_LESSON_KEY) throw new Error('Mã lớp không đúng hoặc lớp đã đóng');
  // The same name in this class resumes that student's own game.
  const sameName = (value: string | null) => Boolean(value && value.trim().toLocaleLowerCase('vi') === data.name.toLocaleLowerCase('vi'));
  const found = async () => {
    const { data: rows } = await supabaseAdmin.from('lesson111_students').select('slot,name,access_hash').eq('classroom_id', room.id).not('name', 'is', null);
    return (rows ?? []).find(row => sameName(row.name));
  };
  const existing = await found();
  if (existing) return { code: data.code, slot: existing.slot, key: await codeJoinKey(room.id, existing.access_hash), title: room.lesson_title };
  for (let attempt = 0; attempt < MAX_CUBE_STUDENTS; attempt++) {
    const { data: slot } = await supabaseAdmin.from('lesson111_students').select('id,slot,access_hash').eq('classroom_id', room.id).is('name', null).order('slot').limit(1).maybeSingle();
    if (!slot) throw new Error(`Lớp đã đủ ${MAX_CUBE_STUDENTS} học sinh`);
    const { data: claimed, error } = await supabaseAdmin.from('lesson111_students').update({ name: data.name }).eq('id', slot.id).is('name', null).select('id').maybeSingle();
    if (error) {
      const joined = await found();
      if (joined) return { code: data.code, slot: joined.slot, key: await codeJoinKey(room.id, joined.access_hash), title: room.lesson_title };
      throw new Error('Không vào được lớp, hãy thử lại');
    }
    if (claimed) return { code: data.code, slot: slot.slot, key: await codeJoinKey(room.id, slot.access_hash), title: room.lesson_title };
  }
  throw new Error('Đang có nhiều học sinh tham gia, hãy thử lại');
});

/** The student's game state on the server clock; elapsed questions are closed and saved on every read. */
export const readQuizSolo = createServerFn({ method: 'POST' }).inputValidator(credential).handler(async ({ data }) => {
  const { supabaseAdmin, room, student } = await verify(data);
  const now = Date.now(), released = assignmentStarted(room.started_at, now);
  let progress = readSoloProgress(student.answers);
  if (released && room.started_at && !room.closed && !progress.completedAt) progress = await persist(supabaseAdmin, student.id, progress, reconcileSteps(progress, room.started_at, now, QUIZ_STEPS));
  return { name: student.name, released, release_at: room.started_at, serverNow: now, closed: room.closed, step: progress.step, answers: released ? progress.answers : [], timings: released ? progress.timings : [], completedAt: progress.completedAt };
});

export const answerQuizSolo = createServerFn({ method: 'POST' }).inputValidator(credential.extend({ step: z.number().int().min(0).max(QUIZ_STEPS.count - 1), answer: z.string().max(1) })).handler(async ({ data }) => {
  const { supabaseAdmin, room, student } = await verify(data);
  const now = Date.now();
  if (room.closed || !room.started_at || !assignmentStarted(room.started_at, now)) throw new Error('Chờ giáo viên giao bài hoặc mở lại lớp');
  if (!isQuizLetter(data.answer)) throw new Error('Câu trả lời chưa hợp lệ');
  const before = readSoloProgress(student.answers);
  const current = reconcileSteps(before, room.started_at, now, QUIZ_STEPS);
  const next = submitStep(current, data.step, data.answer, now, QUIZ_STEPS);
  const saved = await persist(supabaseAdmin, student.id, before, next);
  if (saved.answers[data.step] !== data.answer) throw new Error('Câu hỏi đã kết thúc');
  return { step: saved.step, completedAt: saved.completedAt };
});

/** Teacher only: every joined student's stored progress; ranking is computed in pure quiz-solo.ts. */
export const readQuizSoloResults = createServerFn({ method: 'POST' }).middleware([requireOwner]).inputValidator(z.object({ roomId: z.string().uuid() })).handler(async ({ data, context }) => {
  const { data: room } = await context.supabase.from('classrooms').select('id,lesson_key,started_at').eq('id', data.roomId).eq('owner_id', context.userId).maybeSingle();
  if (!room || room.lesson_key !== QUIZ_SOLO_LESSON_KEY) throw new Error('Không có quyền xem lớp');
  const { data: rows, error } = await context.supabase.from('lesson111_students').select('slot,name,answers').eq('classroom_id', room.id).not('name', 'is', null).order('slot');
  if (error) throw new Error('Không đọc được bài làm');
  return { releasedAt: room.started_at, serverNow: Date.now(), rows: (rows ?? []).map(r => { const { rev: _rev, ...progress } = readSoloProgress(r.answers); return { slot: r.slot, name: r.name ?? '', progress }; }) };
});

/** Same scheduling as Bài 11.1: the future moment is stored as classrooms.started_at, so the game opens exactly then. */
export const scheduleQuizSoloRelease = createServerFn({ method: 'POST' }).middleware([requireOwner]).inputValidator(z.object({ roomId: z.string().uuid(), at: z.string().datetime({ offset: true }).nullable() })).handler(async ({ data, context }) => {
  const { data: room } = await context.supabase.from('classrooms').select('id,lesson_key,started_at').eq('id', data.roomId).eq('owner_id', context.userId).maybeSingle();
  if (!room || room.lesson_key !== QUIZ_SOLO_LESSON_KEY) throw new Error('Không có quyền với lớp này');
  const now = Date.now();
  if (assignmentStarted(room.started_at, now)) throw new Error('Bài đã được giao');
  if (data.at) { const problem = scheduledReleaseError(data.at, now); if (problem) throw new Error(problem); }
  const startedAt = data.at ? new Date(data.at).toISOString() : null;
  const { data: saved, error } = await context.supabase.from('classrooms').update({ started_at: startedAt, current_activity: 1 }).eq('id', room.id).eq('owner_id', context.userId).or(`started_at.is.null,started_at.gt.${new Date(now).toISOString()}`).select('started_at').maybeSingle();
  if (error || !saved) throw new Error('Không hẹn được giờ giao bài');
  return { startedAt: saved.started_at };
});
