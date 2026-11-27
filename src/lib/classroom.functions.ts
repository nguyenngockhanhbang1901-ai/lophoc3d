import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { canEdit, mayReadOtherAnswers, validateTeamCount } from './geometry';
import { acceptsAnswer, canStart, endTime, normalizeTimings, timingAt, type Timing } from './timer';
import { classroomCodeSchema, classroomJoinSchema, codeJoinKey } from './classroom-access';
import { activityReleaseAt, assignmentStarted, toActivity } from './assignment';
import { PAIR_STEPS } from './line-pairs';
import { CUBE_LESSON_KEY, CUBE_LESSON_TITLE, MAX_CUBE_STUDENTS } from './cube-practice';
import { QUIZ_SOLO_LESSON_KEY, QUIZ_SOLO_LESSON_TITLE } from './quiz-solo';
import { GOAL_QUESTIONS } from './goal-questions';
import { GOAL_STEPS, reconcileSteps, submitStep, type StepConfig, type StepProgress } from './goal-progress';
import { QUIZ_STEPS, isQuizLetter } from './quiz-race';
import { ACTIVITY3_QUESTIONS, PHOTO_QUESTIONS, PRACTICE_STEPS, submitUntimed } from './practice-questions';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { canReadLecture, lessonModeSchema, presentationStateSchema } from './classroom-modes';

async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
const accessSchema = z.object({ code: z.string().min(4).max(12), number: z.number().int().min(1).max(10), key: z.string().length(24) });
export const findClassroom = createServerFn({ method: 'POST' }).inputValidator(classroomCodeSchema).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: room } = await supabaseAdmin.from('classrooms').select('id,title,closed,lesson_mode,lesson_key').eq('code', data.code).maybeSingle();
  if (!room) throw new Error('Mã lớp không đúng');
  if (room.closed) throw new Error('Lớp học đã đóng');
  if (room.lesson_key === CUBE_LESSON_KEY) return { title: room.title, numbers: [] as number[], mode: room.lesson_mode, individual: true, lessonKey: room.lesson_key };
  if (room.lesson_key === QUIZ_SOLO_LESSON_KEY) return { title: room.title, numbers: [] as number[], mode: room.lesson_mode, individual: true, lessonKey: room.lesson_key };
  if (canReadLecture(room.lesson_mode, room.closed)) return { title: room.title, numbers: [] as number[], mode: room.lesson_mode };
  const { data: teams, error } = await supabaseAdmin.from('classroom_teams').select('number').eq('classroom_id', room.id).order('number');
  if (error || !teams?.length) throw new Error('Lớp học chưa có tổ');
  return { title: room.title, numbers: teams.map(t => t.number), mode: room.lesson_mode };
});
export const joinClassroom = createServerFn({ method: 'POST' }).inputValidator(classroomJoinSchema).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: room } = await supabaseAdmin.from('classrooms').select('id,closed').eq('code', data.code).maybeSingle();
  if (!room || room.closed) throw new Error('Mã lớp không đúng hoặc lớp đã đóng');
  const { data: team } = await supabaseAdmin.from('classroom_teams').select('access_hash').eq('classroom_id', room.id).eq('number', data.number).maybeSingle();
  if (!team) throw new Error('Tổ không có trong lớp');
  return { code: data.code, number: data.number, key: await codeJoinKey(room.id, team.access_hash) };
});
export const createClassroom = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ title: z.string().trim().min(1).max(100), teamCount: z.number().int().min(1).max(10), mode: lessonModeSchema.default('default'), lessonKey: z.string().default('12') }))
  .handler(async ({ data, context }) => {
    if (!validateTeamCount(data.teamCount)) throw new Error('Tối đa 10 tổ');
    const { data: lesson } = await context.supabase.from('lessons').select().eq('owner_id', context.userId).eq('lesson_key', data.lessonKey).maybeSingle();
    const fallbackTitle = data.lessonKey === CUBE_LESSON_KEY ? CUBE_LESSON_TITLE : data.lessonKey === QUIZ_SOLO_LESSON_KEY ? QUIZ_SOLO_LESSON_TITLE : data.lessonKey === '11' ? 'Bài 11: Hai đường thẳng song song' : 'Bài 12: Đường thẳng và mặt phẳng song song';
    if (!lesson && !['11', '12', CUBE_LESSON_KEY, QUIZ_SOLO_LESSON_KEY].includes(data.lessonKey)) throw new Error('Bài học không tồn tại');
    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
    const { data: classroom, error } = await context.supabase.from('classrooms').insert({ owner_id: context.userId, title: data.title, team_count: data.teamCount, code, lesson_mode: data.mode, lesson_key: data.lessonKey, lesson_title: lesson?.title ?? fallbackTitle, lesson_content: lesson?.content ?? {} }).select().single();
    if (error || !classroom) throw new Error('Không tạo được lớp học');
    // Verified owner just created this room; privileged insert generates secret team capabilities.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // Bài 12.1 uses the same per-student slots as Bài 11.1 (students join by class code and name).
    if (data.lessonKey === CUBE_LESSON_KEY || data.lessonKey === QUIZ_SOLO_LESSON_KEY) {
      const slots = await Promise.all(Array.from({length:MAX_CUBE_STUDENTS},async(_,i)=>({classroom_id:classroom.id,slot:i+1,access_hash:await hash(crypto.randomUUID())})));
      const {error:slotError}=await supabaseAdmin.from('lesson111_students').insert(slots);
      if(slotError) throw new Error('Không tạo được danh sách học sinh');
      return {classroom,invitations:[] as {number:number;key:string}[]};
    }
    const invitations = await Promise.all(Array.from({ length: data.teamCount }, async (_, i) => {
      const key = crypto.randomUUID().replaceAll('-', '').slice(0, 24);
      return { number: i + 1, key, access_hash: await hash(key) };
    }));
    const { error: teamError } = await supabaseAdmin.from('classroom_teams').insert(invitations.map(i => ({ classroom_id: classroom.id, number: i.number, access_hash: i.access_hash })));
    if (teamError) throw new Error('Không tạo được tổ');
    return { classroom, invitations: invitations.map(({ number, key }) => ({ number, key })) };
  });
export const beginAssignment = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ roomId: z.string().uuid(), activity: z.number().int().min(1).max(6) })).handler(async ({ data, context }) => {
    const { data: startedAt, error } = await context.supabase.rpc('begin_classroom_activity', { room_id: data.roomId, activity: data.activity });
    if (error || !startedAt) throw new Error('Không bắt đầu được bài làm');
    return { startedAt };
  });
export const setClassroomActivity = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ roomId: z.string().uuid(), activity: z.number().int().min(1).max(6) }))
  .handler(async ({ data, context }) => {
    const { data: activity, error } = await context.supabase.rpc('set_classroom_activity', { room_id: data.roomId, activity: data.activity });
    if (error || !activity) throw new Error('Không chuyển được hoạt động');
    return { activity };
  });
export const studentRoom = createServerFn({ method: 'POST' }).inputValidator(accessSchema).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: room } = await supabaseAdmin.from('classrooms').select().eq('code', data.code.toUpperCase()).maybeSingle();
  if (!room) throw new Error('Mã lớp không đúng');
  const { data: foundTeam } = await supabaseAdmin.from('classroom_teams').select().eq('classroom_id', room.id).eq('number', data.number).maybeSingle();
  let team = foundTeam;
  if (!team || (team.access_hash !== await hash(data.key) && data.key !== await codeJoinKey(room.id, team.access_hash))) throw new Error('Thông tin tham gia không hợp lệ');
  if (room.current_activity === 1 && room.started_at && !room.closed) team = await persistSteps(supabaseAdmin, team, room.started_at, room.lesson_key === '11' ? PAIR_TRACK : GOAL_TRACK);
  if (room.current_activity === 3 && room.practice1_started_at && !room.closed) team = await persistSteps(supabaseAdmin, team, room.practice1_started_at, PRACTICE_TRACK);
  if (room.current_activity === 6 && room.quiz_started_at && room.lesson_key === '12' && !room.closed) team = await persistSteps(supabaseAdmin, team, room.quiz_started_at, QUIZ_TRACK);
  let released: { number: number; answers: string[]; submitted_at: string | null; timings: Timing[] }[] = [];
  if (mayReadOtherAnswers(room.answers_visible)) {
    const { data: rows } = await supabaseAdmin.from('classroom_teams').select('number,answers,submitted_at,timings').eq('classroom_id', room.id).order('number');
    released = (rows ?? []).map(r => ({ ...r, answers: r.answers as string[], timings: normalizeTimings(r.timings) }));
  }
  return { room: { id: room.id, code: room.code, title: room.title, lesson_key: room.lesson_key, lesson_title: room.lesson_title, lesson_content: room.lesson_content, lesson_mode: room.lesson_mode, presentation_step: room.presentation_step, presentation_review: room.presentation_review, started_at: room.started_at, activity2_started_at: room.activity2_started_at, practice1_started_at: room.practice1_started_at, photo_started_at: room.photo_started_at, activity3_started_at: room.activity3_started_at, quiz_started_at: room.quiz_started_at, current_step: room.current_step, current_activity: room.current_activity, closed: room.closed, answers_visible: room.answers_visible, correct_visible: room.correct_visible }, team: { number: team.number, answers: team.answers as string[], step: team.step, submitted_at: team.submitted_at, timings: normalizeTimings(team.timings), goal_answers: team.goal_answers as string[], goal_step: team.goal_step, goal_timings: (room.lesson_key === '11' ? PAIR_TRACK : GOAL_TRACK).read(team).timings, goal_completed_at: team.goal_completed_at, practice_answers: team.practice_answers as string[], practice_step: team.practice_step, practice_timings: PRACTICE_TRACK.read(team).timings, practice_completed_at: team.practice_completed_at, photo_answers: team.photo_answers as string[], photo_step: team.photo_step, photo_completed_at: team.photo_completed_at, activity3_answers: team.activity3_answers as string[], activity3_step: team.activity3_step, activity3_completed_at: team.activity3_completed_at, quiz_answers: team.quiz_answers as string[], quiz_step: team.quiz_step, quiz_timings: QUIZ_TRACK.read(team).timings, quiz_completed_at: team.quiz_completed_at }, released, serverNow: Date.now() };
});
type Track = { config: StepConfig; read: (team: Tables<'classroom_teams'>) => StepProgress; revision: (team: Tables<'classroom_teams'>) => number; write: (p: StepProgress, revision: number) => TablesUpdate<'classroom_teams'>; revisionColumn: 'goal_revision' | 'practice_revision' | 'quiz_revision' };
function readTimings(raw: unknown, count: number): Timing[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => { const t = list[i] as Partial<Timing> | undefined; return { started_at: t?.started_at ?? null, ended_at: t?.ended_at ?? null }; });
}
/** Activity 1 (six 30s questions) and Luyện tập 1 (three 90s questions) share one server-timed, revision-checked flow. */
const GOAL_TRACK: Track = {
  config: GOAL_STEPS, revisionColumn: 'goal_revision', revision: team => team.goal_revision,
  read: team => ({ answers: team.goal_answers as string[], step: team.goal_step, completedAt: team.goal_completed_at, timings: readTimings(team.goal_timings, GOAL_QUESTIONS.length) }),
  write: (p, revision) => ({ goal_answers: p.answers, goal_step: p.step, goal_completed_at: p.completedAt, goal_timings: p.timings, goal_revision: revision }),
};
const PAIR_TRACK: Track = { ...GOAL_TRACK, config: PAIR_STEPS };
const PRACTICE_TRACK: Track = {
  config: PRACTICE_STEPS, revisionColumn: 'practice_revision', revision: team => team.practice_revision,
  read: team => ({ answers: team.practice_answers as string[], step: team.practice_step, completedAt: team.practice_completed_at, timings: readTimings(team.practice_timings, PRACTICE_STEPS.count) }),
  write: (p, revision) => ({ practice_answers: p.answers, practice_step: p.step, practice_completed_at: p.completedAt, practice_timings: p.timings, practice_revision: revision }),
};
/** Luyện tập 3 · AI NHANH HƠN: seven 30s four-choice questions; one click sends the letter. */
const QUIZ_TRACK: Track = {
  config: QUIZ_STEPS, revisionColumn: 'quiz_revision', revision: team => team.quiz_revision,
  read: team => ({ answers: team.quiz_answers as string[], step: team.quiz_step, completedAt: team.quiz_completed_at, timings: readTimings(team.quiz_timings, QUIZ_STEPS.count) }),
  write: (p, revision) => ({ quiz_answers: p.answers, quiz_step: p.step, quiz_completed_at: p.completedAt, quiz_timings: p.timings, quiz_revision: revision }),
};
async function persistSteps(client: Awaited<ReturnType<typeof verifiedTeam>>['supabaseAdmin'], original: Tables<'classroom_teams'>, release: string, track: Track, submission?: { step: number; answer: string; draft?: boolean }) {
  let team = original;
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = Date.now();
    const current = track.read(team);
    let next = reconcileSteps(current, release, now, track.config);
    if (submission && !next.completedAt && next.step === submission.step) {
      if (submission.draft) {
        const answer = submission.answer.trim();
        if (answer && !track.config.accepts(submission.step, answer)) throw new Error('Câu trả lời chưa hợp lệ');
        next.answers[submission.step] = answer;
      } else next = submitStep(next, submission.step, submission.answer, now, track.config);
    }
    else if (submission && current.completedAt) throw new Error('Bài đã nộp · Không thể sửa');
    if (JSON.stringify(current) === JSON.stringify(next)) return team;
    const revision = track.revision(team);
    const { data: updated, error } = await client.from('classroom_teams').update(track.write(next, revision + 1)).eq('id', team.id).eq(track.revisionColumn, revision).select().maybeSingle();
    if (error) throw new Error('Không lưu được câu trả lời');
    if (updated) return updated;
    const { data: latest } = await client.from('classroom_teams').select().eq('id', team.id).single();
    if (!latest) throw new Error('Không tìm thấy tổ');
    team = latest;
  }
  throw new Error('Đang đồng bộ bài làm, hãy thử lại');
}
async function verifiedTeam(data: z.infer<typeof accessSchema>) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: room } = await supabaseAdmin.from('classrooms').select('id,closed,lesson_key,started_at,current_activity,activity2_started_at,practice1_started_at,photo_started_at,activity3_started_at,quiz_started_at').eq('code', data.code.toUpperCase()).maybeSingle();
  if (!room || room.closed) throw new Error('Lớp học đã đóng');
  if (room.current_activity !== 4 && !assignmentStarted(activityReleaseAt(room, toActivity(room.current_activity)), Date.now())) throw new Error('Chờ giáo viên bắt đầu giao bài');
  const { data: team } = await supabaseAdmin.from('classroom_teams').select().eq('classroom_id', room.id).eq('number', data.number).maybeSingle();
  if (!team || (team.access_hash !== await hash(data.key) && data.key !== await codeJoinKey(room.id, team.access_hash))) throw new Error('Thông tin tham gia không đúng');
  return { supabaseAdmin, team, room };
}
/** Starts a question's 30s clock once; repeated calls (reload, reconnect) keep the original server timestamp. */
export const startQuestion = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({ step: z.number().int().min(0).max(2) })).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.current_activity !== 2) throw new Error('Giáo viên chưa chuyển sang Hoạt động 2');
  if (!canEdit(team.submitted_at)) throw new Error('Bài đã nộp');
  const timings = normalizeTimings(team.timings);
  if (!canStart(timings, data.step)) throw new Error('Hãy hoàn thành câu trước');
  if (!timingAt(timings, data.step).started_at) {
    timingAt(timings, data.step).started_at = data.step === 0 ? room.activity2_started_at ?? new Date().toISOString() : new Date().toISOString();
    const { error } = await supabaseAdmin.from('classroom_teams').update({ timings, step: data.step }).eq('id', team.id).is('submitted_at', null);
    if (error) throw new Error('Không bắt đầu được câu hỏi');
  }
  return { timings };
});
export const saveStudent = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({ step: z.number().int().min(0).max(2), answer: z.string().max(4000), submit: z.boolean() })).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.current_activity !== 2) throw new Error('Giáo viên đã chuyển hoạt động');
  if (!canEdit(team.submitted_at)) throw new Error('Bài đã nộp');
  const timings = normalizeTimings(team.timings);
  const timing = timingAt(timings, data.step);
  if (!timing.started_at) throw new Error('Câu hỏi chưa bắt đầu');
  if (timing.ended_at) throw new Error('Câu hỏi đã kết thúc');
  const now = Date.now();
  const answers = [0, 1, 2].map(i => ((team.answers as string[])[i] ?? ''));
  // Late answers (past deadline + network grace) are discarded; an empty answer is stored as unanswered.
  if (acceptsAnswer(timing.started_at, now)) answers[data.step] = data.answer.trim();
  timing.ended_at = endTime(timing.started_at, now);
  const { error } = await supabaseAdmin.from('classroom_teams').update({ answers, timings, step: Math.min(data.step + 1, 2), submitted_at: data.submit ? new Date(now).toISOString() : null }).eq('id', team.id).is('submitted_at', null);
  if (error) throw new Error('Không lưu được bài');
  return { success: true };
});
/** Persists Activity 1 after each NEXT so a code-only rejoin resumes the team's saved progress. */
export const saveGoalDraft = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({ step: z.number().int().min(0).max(5), answer: z.string().max(4000) })).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.current_activity !== 1 || !room.started_at) throw new Error('Giáo viên đã chuyển hoạt động');
  if (!['11', '12'].includes(room.lesson_key)) throw new Error('Bài học này chỉ để xem');
  if (team.goal_completed_at) throw new Error('Bài đã nộp · Không thể sửa');
  await persistSteps(supabaseAdmin, team, room.started_at, room.lesson_key === '11' ? PAIR_TRACK : GOAL_TRACK, { step: data.step, answer: data.answer, draft: true });
  return { success: true };
});
export const saveGoalAnswer = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({
  step: z.number().int().min(0).max(GOAL_QUESTIONS.length - 1),
  answer: z.string().max(4000),
  completed: z.boolean(),
})).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.current_activity !== 1) throw new Error('Giáo viên đã chuyển sang Hoạt động 2');
  if (!['11', '12'].includes(room.lesson_key)) throw new Error('Bài học này chỉ để xem');
  if (!room.started_at) throw new Error('Chờ giao bài');
  if (team.goal_completed_at) throw new Error('Bài đã nộp · Không thể sửa');
  const updated = await persistSteps(supabaseAdmin, team, room.started_at, room.lesson_key === '11' ? PAIR_TRACK : GOAL_TRACK, { step: data.step, answer: data.answer });
  return { answers: updated.goal_answers as string[], step: updated.goal_step, completedAt: updated.goal_completed_at };
});
/** Luyện tập 1 autosaves the typed answer so a rejoin keeps it; the 90s clock keeps running on the server. */
export const savePracticeDraft = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({ step: z.number().int().min(0).max(PRACTICE_STEPS.count - 1), answer: z.string().max(2000) })).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.lesson_key !== '12' || room.current_activity !== 3 || !room.practice1_started_at) throw new Error('Giáo viên đã chuyển hoạt động');
  if (team.practice_completed_at) throw new Error('Bài đã nộp · Không thể sửa');
  await persistSteps(supabaseAdmin, team, room.practice1_started_at, PRACTICE_TRACK, { step: data.step, answer: data.answer, draft: true });
  return { success: true };
});
/** Sends one Luyện tập 1 answer to the teacher; the last one submits the team's work, which then cannot be changed. */
export const savePracticeAnswer = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({ step: z.number().int().min(0).max(PRACTICE_STEPS.count - 1), answer: z.string().max(2000) })).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.lesson_key !== '12' || room.current_activity !== 3 || !room.practice1_started_at) throw new Error('Giáo viên đã chuyển hoạt động');
  if (team.practice_completed_at) throw new Error('Bài đã nộp · Không thể sửa');
  const updated = await persistSteps(supabaseAdmin, team, room.practice1_started_at, PRACTICE_TRACK, { step: data.step, answer: data.answer });
  return { step: updated.practice_step, completedAt: updated.practice_completed_at };
});
/** Sends a team's chosen letter for the current Luyện tập 3 question; the server clock decides whether it still counts. */
export const saveQuizAnswer = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({ step: z.number().int().min(0).max(QUIZ_STEPS.count - 1), answer: z.string().refine(isQuizLetter) })).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.lesson_key !== '12' || room.current_activity !== 6 || !room.quiz_started_at) throw new Error('Giáo viên đã chuyển hoạt động');
  if (team.quiz_completed_at) throw new Error('Bài đã nộp · Không thể sửa');
  const updated = await persistSteps(supabaseAdmin, team, room.quiz_started_at, QUIZ_TRACK, { step: data.step, answer: data.answer });
  return { step: updated.quiz_step, completedAt: updated.quiz_completed_at };
});
/** Luyện tập 1 (photo) and Hoạt động 3 are untimed: answers are sent once in order; the last one submits and locks the team's work. */
export const saveUntimedAnswer = createServerFn({ method: 'POST' }).inputValidator(accessSchema.extend({ activity: z.union([z.literal(4), z.literal(5)]), step: z.number().int().min(0).max(2), answer: z.string().max(2000) })).handler(async ({ data }) => {
  const { supabaseAdmin, team, room } = await verifiedTeam(data);
  if (room.current_activity !== data.activity) throw new Error('Giáo viên đã chuyển hoạt động');
  const photo = data.activity === 4;
  const current = photo
    ? { answers: team.photo_answers, step: team.photo_step, completedAt: team.photo_completed_at }
    : { answers: team.activity3_answers, step: team.activity3_step, completedAt: team.activity3_completed_at };
  const next = submitUntimed(current, data.step, data.answer, Date.now(), photo ? PHOTO_QUESTIONS.length : ACTIVITY3_QUESTIONS.length);
  // Conditional on the step just read, so a double send or two devices cannot overwrite a sent answer.
  const query = photo
    ? supabaseAdmin.from('classroom_teams').update({ photo_answers: next.answers, photo_step: next.step, photo_completed_at: next.completedAt }).eq('id', team.id).eq('photo_step', current.step).is('photo_completed_at', null)
    : supabaseAdmin.from('classroom_teams').update({ activity3_answers: next.answers, activity3_step: next.step, activity3_completed_at: next.completedAt }).eq('id', team.id).eq('activity3_step', current.step).is('activity3_completed_at', null);
  const { data: updated, error } = await query.select('id').maybeSingle();
  if (error) throw new Error('Không lưu được câu trả lời');
  if (!updated) throw new Error('Câu trả lời đã được gửi');
  return { step: next.step, completedAt: next.completedAt };
});

/** Code is a read-only lecture capability, never a team-answer capability. */
export const readLecture = createServerFn({ method: 'POST' }).inputValidator(classroomCodeSchema).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: room } = await supabaseAdmin.from('classrooms').select('id,code,title,closed,lesson_mode,lesson_key,lesson_title,lesson_content').eq('code', data.code).maybeSingle();
  if (!room || !canReadLecture(room.lesson_mode, room.closed)) throw new Error('Lớp học đã đóng hoặc không chia sẻ bài giảng');
  return { id: room.id, code: room.code, title: room.title, lesson_key: room.lesson_key, lesson_title: room.lesson_title, lesson_content: room.lesson_content, mode: room.lesson_mode };
});
export const savePresentationState = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(presentationStateSchema).handler(async ({ data, context }) => {
  const { data: room, error } = await context.supabase.from('classrooms').update({ current_activity: data.activity, presentation_step: data.step, presentation_review: data.review }).eq('id', data.roomId).eq('owner_id', context.userId).eq('closed', false).select('id').maybeSingle();
  if (error || !room) throw new Error('Không đồng bộ được phần trình chiếu');
  return { saved: true };
});
