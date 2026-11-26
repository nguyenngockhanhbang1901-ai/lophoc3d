import { CubePractice } from './CubePractice';
import { joinCubeClassroom, scheduleCubeRelease, type CubeAccess } from '@/lib/cube-practice.functions';
import { CubeReleaseControls } from './CubeReleaseControls';
import { LessonCatalogue } from './LessonCatalogue';
import { defaultClassroomTitle } from '@/lib/classroom-title';
import { LinePairActivity } from './LinePairActivity';
import { CustomLesson } from './CustomLesson';
import { SlideArrows } from './SlideArrows';
import { stepKeyAction } from '@/lib/step-keys';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Box, BookOpen, Users, GraduationCap, ArrowRight, ChevronLeft, Check, LockKeyhole, Plus, Copy, Eye, EyeOff, LogOut, CircleHelp, Play, Clock, Trash2, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { cases, type CaseIndex } from '@/lib/geometry';
import { createClassroom, findClassroom, joinClassroom, studentRoom, saveStudent, startQuestion, beginAssignment, saveGoalAnswer, saveGoalDraft, savePracticeDraft, savePracticeAnswer, saveUntimedAnswer, saveQuizAnswer, readLecture, savePresentationState } from '@/lib/classroom.functions';
import { canStart, normalizeTimings, remainingMs, timerTone, timingAt } from '@/lib/timer';
import { allTeamsSubmitted, activityAnswersVisible, activityName, activityReleaseAt, answersVisibilityPatch, assignmentStarted, isPresentationPart, LESSON_ORDER, lessonSection, releasePatch, toActivity, type ActivityNumber } from '@/lib/assignment';
import { isPracticeActivity, PRACTICE_SETS } from '@/lib/practice-questions';
import { useClassroomAuth } from '@/hooks/use-classroom-auth';
import { AnswerResults, QUESTION_TEXT } from './AnswerResults';
import { GoalAnswerResults } from './GoalAnswerResults';
import { PracticeAnswerResults } from './PracticeAnswerResults';
import { QuizResults, QuizStudent, QuizTeacher } from './QuizRace';
import { QUIZ_QUESTIONS, QUIZ_STEPS } from '@/lib/quiz-race';
import { ActivityThreeReview } from './ActivityThreeReview';
import { ActivityTwo } from './ActivityTwo';
import { PracticeFigure } from './PracticeFigure';
import { LessonAiKeyControl, LessonAiKeyProvider } from './LessonAiKey';
import { LessonSlides } from './LessonSlides';
import { PresentationFrame } from './PresentationFrame';
import { PresentationCovers, usePreloadCovers } from './PresentationCovers';
import { coverAfterBack, coverAfterEnter, coverOnArrival, isThanksShortcut, thanksAvailable, type PresentationCover } from '@/lib/presentation-covers';
import { ACTIVITY3_STAGES } from '@/lib/activity3-walkthrough';
import { GOAL_QUESTIONS } from '@/lib/goal-questions';
import { GOAL_STEPS, sharedQuestion, type StepProgress } from '@/lib/goal-progress';
import { PRACTICE_STEPS } from '@/lib/practice-questions';
import type { Timing } from '@/lib/timer';
import { needsAssignmentStart, type LessonMode } from '@/lib/classroom-modes';
import { adjacentLessonPart, arrivalScrollTop, PresentationNavigation } from '@/lib/presentation-navigation';
import { enterPresentationFullscreen, exitPresentationFullscreen, isDocumentFullscreen, onFullscreenChange, presentationShortcut, trackPresentingClass } from '@/lib/presentation-fullscreen';
const GeometryView = lazy(() => import('./GeometryView'));
const ActivityOne = lazy(() => import('./ActivityOne'));
const PracticeOne = lazy(() => import('./PracticeOne'));
const QUIZ_PROGRESS = (t: Tables<'classroom_teams'>): StepProgress => ({ answers: (t.quiz_answers as string[]) ?? [], step: t.quiz_step, completedAt: t.quiz_completed_at, timings: Array.isArray(t.quiz_timings) ? t.quiz_timings as unknown as Timing[] : [] });
const PART_INFO: Record<ActivityNumber, { badge: string; detail: string }> = {
  1: { badge: '1', detail: 'Khung thành bóng đá 3D' },
  2: { badge: '2', detail: 'Đường thẳng và mặt phẳng' },
  4: { badge: 'LT1', detail: 'Ảnh sân khấu trường' },
  3: { badge: 'LT2', detail: "Hình hộp chữ nhật ABCD.A'B'C'D'" },
  5: { badge: '3', detail: 'Đường thẳng song song với AB' },
  6: { badge: 'LT3', detail: 'Trò chơi · AI NHANH HƠN' },
};
const LESSON_PARTS = LESSON_ORDER.map(item => ({ item, title: activityName(item), ...PART_INFO[item] }));
type Access = { code: string; number: number; key: string };
type StudentData = Awaited<ReturnType<typeof studentRoom>>;
type Room = Tables<'classrooms'>;
type Team = Tables<'classroom_teams'>;
export default function Classroom() {
  return <LessonAiKeyProvider><ClassroomContent /></LessonAiKeyProvider>;
}
function ClassroomContent() {
  const [lessonKey, setLessonKey] = useState('12');
  const [lessonTitle, setLessonTitle] = useState('Bài 12: Đường thẳng và mặt phẳng song song');
  const [lessonContent, setLessonContent] = useState<unknown>({});
  const [entered, setEntered] = useState(false);
  const [joinInfo, setJoinInfo] = useState<{ title: string; numbers: number[]; mode: string; individual?: boolean } | null>(null);
  const [studentName, setStudentName] = useState('');
  const [cubeAccess, setCubeAccess] = useState<CubeAccess | null>(null);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [index, setIndex] = useState<CaseIndex>(0);
  const [activity, setActivity] = useState<ActivityNumber>(1);
  const [initialLast, setInitialLast] = useState(false);
  const [mode, setMode] = useState<LessonMode>('default');
  const [lecture, setLecture] = useState<Awaited<ReturnType<typeof readLecture>> | null>(null);
  const [slideStep, setSlideStep] = useState(0);
  const stepWrites = useRef(Promise.resolve());
  const [answers, setAnswers] = useState(['','','']);
  const [dialog, setDialog] = useState<'join' | 'create' | null>(null);
  const [code, setCode] = useState(''); const [number, setNumber] = useState(1); const [key, setKey] = useState('');
  const [title, setTitle] = useState(''); const [teamCount, setTeamCount] = useState(4);
  const [access, setAccess] = useState<Access | null>(null); const [student, setStudent] = useState<StudentData | null>(null);
  const [room, setRoom] = useState<Room | null>(null); const [rooms, setRooms] = useState<Room[]>([]); const [teams, setTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<{ number: number; key: string }[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const [help, setHelp] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const user = useClassroomAuth(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const create = useServerFn(createClassroom); const fetchStudent = useServerFn(studentRoom); const save = useServerFn(saveStudent); const start = useServerFn(startQuestion);
  const begin = useServerFn(beginAssignment);
  const scheduleCube = useServerFn(scheduleCubeRelease);
  const draftGoal = useServerFn(saveGoalDraft);
  const saveGoal = useServerFn(saveGoalAnswer); const draftPractice = useServerFn(savePracticeDraft); const sendPractice = useServerFn(savePracticeAnswer); const sendUntimed = useServerFn(saveUntimedAnswer); const sendQuiz = useServerFn(saveQuizAnswer);
  const fetchLecture = useServerFn(readLecture); const saveSlide = useServerFn(savePresentationState);
  const joinCube = useServerFn(joinCubeClassroom);
  const find = useServerFn(findClassroom); const joinByCode = useServerFn(joinClassroom);
  const [now, setNow] = useState(() => Date.now()); const [offset, setOffset] = useState(0); const expiring = useRef(false);
  useEffect(() => { if (user && window.sessionStorage.getItem('classroom-enter-teacher')) { window.sessionStorage.removeItem('classroom-enter-teacher'); setRole('teacher'); setEntered(true); } }, [user]);
  useEffect(() => { const p = new URLSearchParams(window.location.search); if (p.get('code')) { setCode(p.get('code') ?? ''); setKey(p.get('key') ?? ''); setNumber(Number(p.get('team') ?? '1')); } }, []);
  const refreshTeacher = useCallback(async () => {
    if (!user) return;
    const { data: all } = await supabase.from('classrooms').select().order('created_at', { ascending: false }); setRooms(all ?? []);
    if (room) {
      const { data: updated } = await supabase.from('classrooms').select().eq('id', room.id).single(); if (updated) setRoom(updated);
      const { data: rows } = await supabase.from('classroom_teams').select().eq('classroom_id', room.id).order('number'); setTeams(rows ?? []);
    }
  }, [user, room?.id]);
  useEffect(() => { void refreshTeacher(); }, [refreshTeacher]);
  const presenting = role === 'teacher' && room?.lesson_mode === 'presentation';
  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: KeyboardEvent) => {
      const shortcut = presentationShortcut(event, true, activity);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === 'fullscreen') enterPresentationFullscreen(); else shortcutAction.current(shortcut);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [presenting, activity]);
  const shortcutAction = useRef<(shortcut: 'assign' | 'answers') => void>(() => {});
  useEffect(() => trackPresentingClass(), []);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => { setFullscreen(isDocumentFullscreen()); return onFullscreenChange(setFullscreen); }, []);
  // Full screen presentation hides the whole top area and shows only the fixed lesson title.
  const presentingFullscreen = presenting && fullscreen;
  // Opening/closing pictures exist only in full screen presentation; any other state clears them.
  const [cover, setCover] = useState<PresentationCover | null>(null);
  const [coverRound, setCoverRound] = useState(0);
  usePreloadCovers(presenting);
  const startWelcome = useRef<() => void>(() => {});
  const arrivingActivity = useRef<ActivityNumber | null>(null);
  useEffect(() => { if (presentingFullscreen) startWelcome.current(); else setCover(null); }, [presentingFullscreen]);
  useEffect(() => {
    if (!cover) return;
    const onKey = (event: KeyboardEvent) => {
      const action = stepKeyAction(event.key);
      if (!action || event.repeat || event.isComposing) return;
      event.preventDefault(); event.stopPropagation();
      setCover(current => action === 'next' ? coverAfterEnter(current) : coverAfterBack(current));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cover]);
  useEffect(() => { if (room) setActivity(toActivity(room.current_activity)); }, [room?.id, room?.current_activity]);
  useEffect(() => {
    if (!room || !user) return;
    const onChange = () => { void refreshTeacher().catch(() => {}); };
    const channel = supabase.channel(`teacher-${room.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_teams', filter: `classroom_id=eq.${room.id}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classrooms', filter: `id=eq.${room.id}` }, onChange).subscribe();
    const poll = window.setInterval(onChange, 2000);
    window.addEventListener('focus', onChange);
    return () => { window.clearInterval(poll); window.removeEventListener('focus', onChange); void supabase.removeChannel(channel); };
  }, [room?.id, user, refreshTeacher]);
  useEffect(() => {
    if (!access) return;
    // Capability-only students cannot subscribe to private table rows; fetch sanitized state periodically.
    const timer = window.setInterval(() => { void refresh(access).catch(() => {}); }, 1000);
    return () => window.clearInterval(timer);
  }, [access, fetchStudent]);
  useEffect(() => { if (!access) return; const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, [access]);
  useEffect(() => {
    if (!lecture) return;
    const poll = window.setInterval(() => { void fetchLecture({ data: { code: lecture.code } }).catch(() => { setLecture(null); setEntered(false); setJoinInfo(null); setError('Lớp học đã đóng'); }); }, 1000);
    return () => window.clearInterval(poll);
  }, [lecture?.code, fetchLecture]);
  async function refresh(a: Access) { const d = await fetchStudent({ data: a }); setOffset(d.serverNow - Date.now()); setStudent(d); return d; }
  async function ensureStarted(a: Access, d: StudentData, step: number) {
    if (!assignmentStarted(d.room.activity2_started_at, d.serverNow) || d.team.submitted_at || d.room.closed || timingAt(d.team.timings, step).started_at || !canStart(d.team.timings, step)) return d;
    await start({ data: { ...a, step } }); return refresh(a);
  }
  const timings = student?.team.timings ?? normalizeTimings([]);
  const currentStep = student?.team.step ?? 0;
  const currentTiming = timingAt(timings, currentStep);
  const serverNow = now + offset;
  const currentRemaining = remainingMs(currentTiming.started_at, serverNow);
  const released = assignmentStarted(student?.room.activity2_started_at, serverNow);
  const activityOneReleased = assignmentStarted(student?.room.started_at, serverNow);
  const currentActivity: ActivityNumber = role === 'student' && access ? toActivity(student?.room.current_activity) : activity;
  const activeLessonKey = role === 'student' ? student?.room.lesson_key ?? lecture?.lesson_key ?? lessonKey : room?.lesson_key ?? lessonKey;
  const activeLessonTitle = role === 'student' ? student?.room.lesson_title ?? lecture?.lesson_title ?? lessonTitle : room?.lesson_title ?? lessonTitle;
  const activeLessonContent = role === 'student' ? student?.room.lesson_content ?? lecture?.lesson_content ?? lessonContent : room?.lesson_content ?? lessonContent;
  const legacyLesson = activeLessonKey === '12';
  // Tab: the teacher can close the lesson with the thank-you picture from any part.
  useEffect(() => {
    if (!presentingFullscreen || !legacyLesson) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isThanksShortcut(event, true)) return;
      event.preventDefault(); event.stopPropagation();
      setCover('thanks');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [presentingFullscreen, legacyLesson]);
  const cubeLesson = activeLessonKey === '11.1';
  const section = legacyLesson ? lessonSection(currentActivity) : null;
  const waiting = currentActivity === 2 && role === 'student' && Boolean(access) && !released;
  const running = Boolean(currentActivity === 2 && released && access && currentTiming.started_at && !currentTiming.ended_at && !student?.team.submitted_at && !student?.room.closed);
  const editable = running && index === currentStep && currentRemaining > 0;
  useEffect(() => {
    if (!access || !student || isPresentationPart(currentActivity) || currentActivity !== 2 || !released || currentTiming.started_at || student.team.submitted_at || student.room.closed) return;
    void start({ data: { ...access, step: student.team.step } }).then(() => refresh(access)).catch(() => {});
  }, [access, student?.room.current_activity, student?.team.step, currentTiming.started_at, released]);
  useEffect(() => {
    // Time is up: lock input and persist (empty = unanswered). Server caps the end time at the deadline.
    if (!access || !running || currentRemaining > 0 || expiring.current) return;
    expiring.current = true;
    void save({ data: { ...access, step: currentStep, answer: answers[currentStep] ?? '', submit: currentStep === 2 } }).catch(() => {}).then(() => refresh(access)).catch(() => {}).finally(() => { expiring.current = false; });
  }, [access, running, currentRemaining, currentStep]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch(e) { setError(e instanceof Error ? e.message : 'Có lỗi xảy ra'); } finally { setBusy(false); } }
  async function lookup() { await action(async () => { const info = await find({ data: { code } }); setJoinInfo(info); if (!info.numbers.includes(number)) setNumber(info.numbers[0] ?? 1); }); }
  async function join() { await action(async () => { if (joinInfo?.individual) { const normalized = code.toUpperCase().trim(); const joined = await joinCube({data:{code:normalized,name:studentName}}); const a: CubeAccess = {code:joined.code,slot:joined.slot,key:joined.key}; setCubeAccess(a); setAccess(null); setStudent(null); setLecture(null); setRoom(null); setLessonKey('11.1'); setLessonTitle('Bài 11.1: Hai đường thẳng song song'); setRole('student'); setDialog(null); setEntered(true); return; } setCubeAccess(null); if (joinInfo?.mode === 'lecture') { const content = await fetchLecture({ data: { code } }); setLecture(content); setAccess(null); setStudent(null); setRole('student'); setActivity(1); setInitialLast(false); setDialog(null); setEntered(true); return; } const a = key ? { code: code.toUpperCase().trim(), number, key: key.trim() } : await joinByCode({ data: { code, number } }); const data = await refresh(a); setAccess(a); setAnswers([0,1,2].map(i => data.team.answers[i] ?? '')); setIndex(data.team.step as CaseIndex); setRole('student'); setDialog(null); setEntered(true);  }); }
  async function scheduleRelease(at: string | null) { if (!room) return; let saved = false; await action(async () => { const result = await scheduleCube({ data: { roomId: room.id, at } }); setRoom({ ...room, started_at: result.startedAt }); await refreshTeacher(); saved = true; }); if (!saved) throw new Error('not saved'); }
  async function releaseAssignment() { if (!room) return; const target = activity; await action(async () => { const result = await begin({ data: { roomId: room.id, activity: target } }); setRoom({ ...room, ...releasePatch(target, result.startedAt) }); await refreshTeacher(); }); }
  async function makeRoom() { if (mode === 'presentation') enterPresentationFullscreen(); await action(async () => { const result = await create({ data: { title, teamCount: cubeLesson ? 1 : teamCount, mode, lessonKey: activeLessonKey } }); setLecture(null); setRoom(result.classroom); setInitialLast(false); setSlideStep(0); setActivity(1); setInvitations(result.invitations); setDialog(null); }); }
  async function selectActivity(nextActivity: ActivityNumber, fromPrevious = false) {
    if (role === 'student' && access && !lecture) return;
    if (busy || !legacyLesson && nextActivity !== 1) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setCover(coverOnArrival(nextActivity, presentingFullscreen && legacyLesson, fromPrevious));
    arrivingActivity.current = nextActivity;
    if (lecture || !room || !user) { setInitialLast(fromPrevious); setSlideStep(0); setActivity(nextActivity); return; }
    await action(async () => {
      await stepWrites.current;
      const review = activityAnswersVisible(room, nextActivity);
      const lectureMode = room.lesson_mode === 'lecture';
      const total = nextActivity === 6 ? lectureMode ? QUIZ_QUESTIONS.length * 2 + 1 : QUIZ_QUESTIONS.length + 1 : nextActivity === 2 ? 4 : nextActivity === 5 ? ACTIVITY3_STAGES.length : nextActivity === 1 ? lectureMode ? GOAL_QUESTIONS.length * 2 + 2 : review ? GOAL_QUESTIONS.length + 2 : GOAL_QUESTIONS.length + 1 : lectureMode || room.lesson_mode === 'presentation' && review ? PRACTICE_SETS[nextActivity].questions.length * 2 + 1 : review ? PRACTICE_SETS[nextActivity].questions.length : PRACTICE_SETS[nextActivity].questions.length + 1;
      const step = fromPrevious ? total - 1 : 0;
      await saveSlide({ data: { roomId: room.id, activity: nextActivity, step, review } });
      setSlideStep(step); setInitialLast(false); setRoom({ ...room, current_activity: nextActivity, presentation_step: step, presentation_review: review }); setActivity(nextActivity);
    });
    arrivingActivity.current = null;
  }
  async function deleteRoom() {
    if (!room) return; const target = room;
    await action(async () => {
      const { error: err } = await supabase.from('classrooms').delete().eq('id', target.id); if (err) throw err;
      setRoom(null); setTeams([]); setInvitations([]); setActivity(1); setRooms(list => list.filter(r => r.id !== target.id)); setConfirmDelete(false);
    });
  }
  function movePart(direction: -1 | 1) {
    const target = legacyLesson ? adjacentLessonPart(currentActivity, direction) : undefined;
    if (target) { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); void selectActivity(target, direction === -1); }
  }
  async function updateRoom(patch: Partial<Room>) { if (!room) return; await action(async () => { const { error: err } = await supabase.from('classrooms').update(patch).eq('id', room.id); if (err) throw err; setRoom({ ...room, ...patch }); }); }
  async function next() {
    if (!access) { setDialog('join'); return; }
    if (!released) return;
    await action(async () => { if (index === currentStep && running) await save({ data: { ...access, step: index, answer: answers[index] ?? '', submit: index === 2 } }); let data = await refresh(access); if (index < 2) { data = await ensureStarted(access, data, index + 1); setIndex((index + 1) as CaseIndex); } setSaved(true); });
  }
  async function copyInvitation(n: number) { await action(async () => { const url = new URL(window.location.origin); url.searchParams.set('code', room?.code ?? ''); url.searchParams.set('team', String(n)); await navigator.clipboard.writeText(url.toString()); setSaved(true); }); }
  const followingSlides = role === 'student' && Boolean(access) && (currentActivity === 2 || currentActivity === 5);
  const slideReview = role === 'teacher' ? Boolean(room && activityAnswersVisible(room, currentActivity)) : Boolean(student?.room.presentation_review);
  const lectureContent = Boolean(lecture || role === 'teacher' && room?.lesson_mode === 'lecture');
  const presentStep = (step: number) => {
    setSlideStep(step);
    if (!room || role !== 'teacher' || room.closed) return;
    const data = { roomId: room.id, activity: currentActivity, step, review: slideReview };
    stepWrites.current = stepWrites.current.catch(() => {}).then(async () => { await saveSlide({ data }); }).catch(() => setError('Không đồng bộ được phần trình chiếu'));
  };
  // Entering full screen on Hoạt động 1 opens with the welcome picture, then Hoạt động 1 from its first step.
  startWelcome.current = () => {
    // A part switch still being saved counts as the current part, so full screen right after switching never shows the welcome.
    if (!legacyLesson || (arrivingActivity.current ?? currentActivity) !== 1) return;
    setCover('welcome'); setInitialLast(false); setCoverRound(round => round + 1);
    setRoom(current => current && { ...current, presentation_step: 0 });
    if (slideStep !== 0 || room?.presentation_step) presentStep(0);
  };
  const results = role === 'teacher' ? Boolean(room && activityAnswersVisible(room, currentActivity)) : Boolean(student?.room.answers_visible);
  // Bài 11.1 may hold a future scheduled release, which is not yet handed out.
  const teacherReleased = Boolean(room && (cubeLesson ? assignmentStarted(room.started_at, Date.now()) : activityReleaseAt(room, activity)));
  const resultsRef = useRef<HTMLDivElement>(null);
  const partTop = useRef<HTMLDivElement>(null);
  const shownPart = useRef(currentActivity);
  useEffect(() => {
    // A new part opens on its first slide: bring its start back on screen instead of keeping the previous part's scroll position.
    if (shownPart.current === currentActivity) return;
    shownPart.current = currentActivity;
    const anchor = partTop.current; if (!anchor) return;
    const top = arrivalScrollTop(window.scrollY, anchor.getBoundingClientRect().top + window.scrollY - 12, presentingFullscreen);
    if (top !== null) window.scrollTo({ top, behavior: 'instant' });
  }, [currentActivity, presentingFullscreen]);
  // Hoạt động 1 / Luyện tập 2: once handed out, the teacher's screen shows Câu 1 and moves on after every team has finished each question.
  const autoRelease = role === 'teacher' && room && legacyLesson && room.lesson_mode !== 'lecture' && (activity === 1 || activity === 3 || activity === 6) && !results ? activityReleaseAt(room, activity) : null;
  useEffect(() => { if (!autoRelease) return; setNow(Date.now()); const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [autoRelease]);
  const teamSteps = (t: Team): StepProgress => activity === 6 ? QUIZ_PROGRESS(t) : activity === 1
    ? { answers: (t.goal_answers as string[]) ?? [], step: t.goal_step, completedAt: t.goal_completed_at, timings: Array.isArray(t.goal_timings) ? t.goal_timings as unknown as Timing[] : [] }
    : { answers: (t.practice_answers as string[]) ?? [], step: t.practice_step, completedAt: t.practice_completed_at, timings: Array.isArray(t.practice_timings) ? t.practice_timings as unknown as Timing[] : [] };
  const autoQuestion = autoRelease && room ? sharedQuestion(teams.filter(t => t.classroom_id === room.id).map(teamSteps), autoRelease, now, activity === 1 ? GOAL_STEPS : activity === 6 ? QUIZ_STEPS : PRACTICE_STEPS) : null;
  function toggleAnswers() { setSlideStep(0); setInitialLast(false); void updateRoom({ ...answersVisibilityPatch(activity, !results), presentation_step: 0, presentation_review: !results }); }
  // Hoạt động 1 / Luyện tập 2: the moment the last team submits, SHOW ANSWER turns on by itself (once per class and part).
  const submittedBefore = useRef(new Map<string, boolean>());
  useEffect(() => {
    if (role !== 'teacher' || !room || !legacyLesson || room.lesson_mode === 'lecture' || (activity !== 1 && activity !== 3 && activity !== 6)) return;
    if (teams.length === 0 || teams.some(t => t.classroom_id !== room.id)) return;
    const k = `${room.id}-${activity}`;
    const all = allTeamsSubmitted(teams, activity);
    const before = submittedBefore.current.get(k);
    submittedBefore.current.set(k, all);
    if (all && before === false && !results && activityReleaseAt(room, activity)) toggleAnswers();
  }, [teams, room?.id, activity, results, legacyLesson, role]);
  // F1 / F2 do exactly what the "Bắt đầu giao bài" and SHOW ANSWER buttons do.
  shortcutAction.current = shortcut => {
    if (!room || busy || !['11', '12', '11.1'].includes(activeLessonKey) || isPresentationPart(activity)) return;
    if (shortcut === 'assign') { if (needsAssignmentStart(activity) && !room.closed && !teacherReleased) void releaseAssignment(); }
    else toggleAnswers();
  };
  // Bring the published answers into view as soon as SHOW ANSWER takes effect, so nobody has to scroll to find them.
  useEffect(() => { if (results && !presenting) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [results, currentActivity]);
  const locked = Boolean(student?.team.submitted_at || student?.room.closed);
  function renderQuiz() {
    if (role === 'teacher') {
      const release = room?.quiz_started_at ?? null;
      const quizTeams = teams.filter(t => room && t.classroom_id === room.id).map(t => ({ number: t.number, progress: QUIZ_PROGRESS(t) }));
      if (results) return <div ref={resultsRef} className="results-anchor"><div className="model-heading"><h2>Kết quả các tổ · Luyện tập 3 · AI NHANH HƠN</h2></div><QuizResults teams={quizTeams} releasedAt={release} /></div>;
      return <QuizTeacher teams={quizTeams} releasedAt={release && assignmentStarted(release, Date.now()) ? release : null} autoQuestion={autoQuestion} />;
    }
    const t = student?.team;
    return <QuizStudent key={access ? `${access.code}-${access.number}` : 'preview'} released={assignmentStarted(student?.room.quiz_started_at, serverNow)} step={t?.quiz_step ?? 0} answers={t?.quiz_answers ?? []} timings={t?.quiz_timings ?? []} completed={Boolean(t?.quiz_completed_at)} closed={Boolean(student?.room.closed)} serverNow={serverNow} onAnswer={access ? async (step, answer) => { await sendQuiz({ data: { ...access, step, answer } }); await refresh(access); } : undefined} />;
  }
  function renderPractice(part: 3 | 4 | 5) {
    const set = PRACTICE_SETS[part];
    if (followingSlides || lecture || room?.lesson_mode === 'lecture' || role === 'teacher' && room?.lesson_mode === 'presentation' && !(part === 3 && results)) return <LessonSlides part={part} review={slideReview} lecture={Boolean(lecture || room?.lesson_mode === 'lecture')} autoQuestion={part === 3 ? autoQuestion : null} />;
    if (isPresentationPart(part)) {
      // Teacher-led slideshow: the teacher steps through it with Enter; students just follow on the shared screen.
      if (role === 'teacher') return part === 4 ? <LessonSlides part={4} review={false} lecture /> : <ActivityThreeReview />;
      return <><PracticeFigure set={set} highlight={null} recap={null} /><section className="goal-waiting" role="status"><BookOpen size={24} /><div><h2>{set.title}</h2><p>Các em theo dõi phần trình chiếu của giáo viên trên màn hình chung.</p></div></section></>;
    }
    if (role === 'teacher' && results) {
      const reviewTeams = teams.map(t => part === 3 ? { number: t.number, answers: t.practice_answers, timings: t.practice_timings } : { number: t.number, answers: t.photo_answers });
      return <div ref={resultsRef} className="results-anchor"><div className="model-heading"><h2>Câu trả lời của các tổ · {set.title}</h2></div><PracticeAnswerResults key={part} set={set} teams={reviewTeams} /></div>;
    }
    const t = student?.team;
    const progress = part === 3 ? { answers: t?.practice_answers, step: t?.practice_step, completed: t?.practice_completed_at } : part === 4 ? { answers: t?.photo_answers, step: t?.photo_step, completed: t?.photo_completed_at } : { answers: t?.activity3_answers, step: t?.activity3_step, completed: t?.activity3_completed_at };
    const partReleased = part === 4 || assignmentStarted(student ? activityReleaseAt(student.room, part) : null, serverNow);
    const onSave = role === 'student' && access ? async (step: number, answer: string) => {
      if (part === 3) await sendPractice({ data: { ...access, step, answer } });
      else await sendUntimed({ data: { ...access, activity: part, step, answer } });
      await refresh(access);
    } : undefined;
    return <Suspense fallback={<div className="box-figure" />}><PracticeOne key={`${part}-${access ? `${access.code}-${access.number}` : role}`} set={set} teacherPreview={role === 'teacher'} autoQuestion={part === 3 ? autoQuestion : null} questionsVisible={role === 'teacher' || partReleased} initialAnswers={progress.answers} initialStep={progress.step} initialCompleted={Boolean(progress.completed)} timings={part === 3 ? t?.practice_timings : undefined} serverNow={serverNow} closed={Boolean(student?.room.closed)} onDraft={part === 3 && role === 'student' && access ? async (step, answer) => { await draftPractice({ data: { ...access, step, answer } }); } : undefined} onSave={onSave} /></Suspense>;
  }
  if (!entered) return <>
    <header className="app-header"><div className="brand"><span className="brand-symbol"><Box size={24} /></span><div>Hình học 3D<small>Lớp học hình học không gian</small></div></div></header>
    <main className="entry-workspace">
      <div className="entry-heading"><p className="eyebrow">Toán học 11</p><h1>Hình học 3D</h1><p>Bài học hình học không gian</p></div>
      {user && <LessonCatalogue userId={user.id} value={lessonKey} disabled={false} onChange={(key, name, content) => { setLessonKey(key); setLessonTitle(name); setLessonContent(content); setActivity(1); setSlideStep(0); }} />}
      <Button variant="outline" className="mb-8" onClick={() => { setRoom(null); setCubeAccess(null); setAccess(null); setStudent(null); setLecture(null); setRole('teacher'); setEntered(true); }}><BookOpen />Xem bài học</Button>
      <div className="entry-columns">
        <section className="entry-section"><GraduationCap className="text-primary" size={32} /><h2>Giáo viên</h2><Button className="w-full" onClick={() => { if (user) { setRole('teacher'); setEntered(true); } else void navigate({ to: '/auth' }); }}>{user ? 'Vào lớp học của tôi' : 'Đăng nhập giáo viên'}<ArrowRight /></Button></section>
        <section className="entry-section"><Users className="text-success" size={32} /><h2>Học sinh</h2><form className="form-stack" onSubmit={e => { e.preventDefault(); if (joinInfo) void join(); else void lookup(); }}>
          <label>Mã lớp<Input required minLength={4} maxLength={12} autoComplete="off" placeholder="Nhập mã lớp" value={code} onChange={e => { setCode(e.target.value); setKey(''); setJoinInfo(null); setError(''); }} /></label>
          {joinInfo && (joinInfo.individual || joinInfo.mode !== 'lecture') && <><p>{joinInfo.title}</p>{joinInfo.individual ? <label>Họ và tên<Input aria-label="Họ và tên" required minLength={2} maxLength={100} value={studentName} onChange={e => setStudentName(e.target.value)} autoComplete="name" /></label> : <label>Chọn tổ<select aria-label="Chọn tổ" className="entry-select" value={number} onChange={e => setNumber(Number(e.target.value))}>{joinInfo.numbers.map(n => <option key={n} value={n}>Tổ {n}</option>)}</select></label>}</>}
          {error && <p className="error-note" role="alert">{error}</p>}
          <Button disabled={busy} type="submit" variant="outline">{busy ? 'Đang xử lý…' : joinInfo ? 'Vào lớp học' : 'Tham gia lớp học'}<ArrowRight /></Button>
        </form></section>
      </div>
    </main>
  </>;
  return <>
    {presentingFullscreen && <PresentationCovers cover={cover} />}
    {presentingFullscreen && <div className={`presentation-title ${section ? 'has-section' : ''}`} role="banner"><span>{activeLessonTitle.replace(/^Bài \d+:\s*/, '')}</span>{section && <span className="presentation-section">{section}</span>}</div>}
    <header className={`app-header ${presentingFullscreen ? "presentation-hidden" : ""}`}><div className="brand"><span className="brand-symbol"><Box size={24} strokeWidth={1.7} /></span><div>Hình học 3D<small>Không gian khám phá · Kết nối tri thức</small></div></div>
      <div className="header-actions flex items-center gap-2"><Button variant="ghost" size="sm" aria-label="Trang chủ" onClick={() => { setEntered(false); setJoinInfo(null); setError(''); }}><ChevronLeft /><span className="header-label">Trang chủ</span></Button><Button variant="ghost" size="icon" title="Trợ giúp" aria-label="Trợ giúp" onClick={() => setHelp(true)}><CircleHelp /></Button>{user ? <Button variant="ghost" size="sm" aria-label="Đăng xuất" onClick={() => { void action(async () => { await queryClient.cancelQueries(); queryClient.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }); }}><LogOut /><span className="header-label">Đăng xuất</span></Button> : <Button variant="outline" size="sm" aria-label="Đăng nhập" onClick={() => { void navigate({ to: '/auth' }); }}><GraduationCap /><span className="header-label">Đăng nhập</span></Button>}{user && role === 'teacher' && <Button variant="ghost" size="sm" asChild><Link to="/soan-bai"><Presentation /><span className="header-label">Soạn bài giảng</span></Link></Button>}{user && role === 'teacher' && <LessonAiKeyControl />}</div>
    </header>
    <main className={`workspace ${presenting ? 'teacher-presentation' : ''} ${presentingFullscreen ? 'presenting-fullscreen' : ''} ${presentingFullscreen && section ? 'has-section' : ''}`}><div className="eyebrow flex items-center gap-2"><BookOpen size={13} />Bài học <span className="text-muted-foreground">/</span> Toán học 11 <span className="text-muted-foreground">/</span> Hình học không gian</div>
      <div className="lesson-heading"><div><h1>{activeLessonTitle}</h1><p>Khám phá vị trí tương đối trong không gian</p></div>{user && <div className="role-switch"><Button variant="ghost" className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}><Users />Học sinh</Button><Button variant="ghost" className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')}><GraduationCap />Giáo viên</Button></div>}</div>
      {!cubeAccess && <LessonCatalogue userId={role === 'teacher' ? user?.id : undefined} value={activeLessonKey} disabled={Boolean(access || cubeAccess || lecture || room)} onChange={(key, name, content) => { setLessonKey(key); setLessonTitle(name); setLessonContent(content); setActivity(1); setSlideStep(0); }} />}
      {role === 'teacher' ? <div className="teacher-strip"><strong>{room ? `${room.title} · Mã lớp ${room.code}` : 'Lớp học của bạn'}</strong>{!user ? <Button onClick={() => { void navigate({ to: '/auth' }); }}>Đăng nhập để tạo lớp<ArrowRight /></Button> : <><select aria-label="Chọn lớp" className="bg-background border border-input rounded-md p-2 text-xs" value={room?.id ?? ''} onChange={e => { e.target.blur(); setInitialLast(false); setSlideStep(0); const selected = rooms.find(r => r.id === e.target.value) ?? null; if (selected?.lesson_mode === 'presentation') enterPresentationFullscreen(); else exitPresentationFullscreen(); setRoom(selected); setActivity(toActivity(selected?.current_activity)); setInvitations([]); }}><option value="">Chọn lớp học</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.title} · {r.code}</option>)}</select><Button onClick={() => { setTitle(defaultClassroomTitle(activeLessonTitle, new Date())); setDialog('create'); }} size="sm"><Plus />Tạo lớp</Button>{room && <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 />Xóa lớp</Button>}{room && <><select aria-label="Chế độ lớp học" className="entry-select" value={room.lesson_mode} onChange={e => { e.target.blur(); if (e.target.value === 'presentation') enterPresentationFullscreen(); else exitPresentationFullscreen(); setSlideStep(0); setInitialLast(false); void updateRoom({ lesson_mode: e.target.value, presentation_step: 0, presentation_review: false }); }}><option value="default">Thông thường</option><option value="lecture">Bài giảng</option><option value="presentation">Trình chiếu</option></select>{['11', '12', '11.1'].includes(activeLessonKey) && !isPresentationPart(activity) && room.lesson_mode !== 'lecture' && <>{needsAssignmentStart(activity) && (cubeLesson ? <CubeReleaseControls startedAt={room.started_at} closed={room.closed} busy={busy} onReleaseNow={() => { void releaseAssignment(); }} onSchedule={scheduleRelease} /> : <Button size="sm" disabled={busy || room.closed || teacherReleased} onClick={() => { void releaseAssignment(); }}><Play />{teacherReleased ? `Đã giao bài ${activityName(activity)}` : `Bắt đầu giao bài ${activityName(activity)}`}</Button>)}<Button size="sm" variant="outline" disabled={busy} onClick={toggleAnswers}>{results ? <EyeOff /> : <Eye />}{results ? 'Ẩn bài làm' : 'SHOW ANSWER'}</Button></>}<Button size="sm" variant="outline" onClick={() => { void updateRoom({ closed: !room.closed }); }}>{room.closed ? 'Mở lại lớp' : 'Đóng lớp'}</Button></>}</>}</div> : <div className="flex justify-end mb-4"><Button variant="outline" size="sm" onClick={() => setDialog('join')}><Users />{cubeAccess ? `${cubeAccess.code} · ${studentName}` : student ? `${student.room.code} · Tổ ${student.team.number}` : 'Tham gia lớp học'}<ArrowRight /></Button></div>}
      {error && <p role="alert" className="error-note mb-4">{error}</p>}
      {!(cubeLesson && role === 'student') && <nav className="activity-switch" aria-label="Các hoạt động trong bài học">{(legacyLesson ? LESSON_PARTS : [{ item: 1 as const, badge: '1', title: cubeLesson ? 'Luyện tập 1' : 'Hoạt động 1', detail: cubeLesson ? 'Hình lập phương · 6 câu hỏi' : 'Hai đường thẳng trong không gian' }]).map(({ item, badge, title: partTitle, detail }) => <Button key={item} variant="ghost" title={detail} className={currentActivity === item ? 'active' : ''} aria-current={currentActivity === item ? 'step' : undefined} disabled={role === 'student' && Boolean(access) && currentActivity !== item} onClick={() => { void selectActivity(item); }}><span>{badge}</span><div><strong>{partTitle}</strong><small>{detail}</small></div>{role === 'student' && access && currentActivity !== item && <LockKeyhole size={14} />}</Button>)}</nav>}
      <div ref={partTop} aria-hidden />
      <PresentationFrame enabled={presenting} shrink={!presentingFullscreen} reserved={presentingFullscreen ? (section ? 132 : 92) : 28} slideKey={`${currentActivity}-${slideStep}-${results}`}>
      {legacyLesson && (role === 'teacher' || lecture) && [1, 3, 4].includes(currentActivity) && <SlideArrows />}
      <PresentationNavigation.Provider key={`${lecture?.id ?? room?.id ?? 'preview'}-${currentActivity}-${results}-${room?.lesson_mode ?? ''}-${coverRound}`} value={role === 'teacher' || lecture ? { onFinish: legacyLesson && thanksAvailable(currentActivity, presentingFullscreen) ? () => setCover('thanks') : legacyLesson && adjacentLessonPart(currentActivity, 1) ? () => movePart(1) : undefined, onBack: legacyLesson && adjacentLessonPart(currentActivity, -1) ? () => movePart(-1) : legacyLesson && presentingFullscreen && currentActivity === 1 ? () => setCover('title') : undefined, readOnly: cover !== null, aiRoomId: role === 'teacher' ? room?.id : undefined, initialLast, initialStep: lecture ? 0 : room?.presentation_step ?? 0, onStep: presentStep } : followingSlides ? { controlledStep: student?.room.presentation_step ?? 0, readOnly: true } : {}}>
      {cubeLesson ? <CubePractice teacher={role === 'teacher'} roomId={room?.id} review={results} access={cubeAccess} /> : activeLessonKey === '11' ? <LinePairActivity teacher={role === 'teacher'} lecture={lectureContent} released={activityOneReleased} review={results} step={student?.team.goal_step ?? 0} answers={student?.team.goal_answers ?? []} timings={student?.team.goal_timings ?? []} completed={Boolean(student?.team.goal_completed_at)} closed={Boolean(student?.room.closed)} now={serverNow} teams={teams} onDraft={role === 'student' && access ? async (step, answer) => { await draftGoal({ data: { ...access, step, answer } }); } : undefined} onSave={role === 'student' && access ? async (step, answer) => { await saveGoal({ data: { ...access, step, answer, completed: step === 5 } }); await refresh(access); } : undefined} /> : !legacyLesson ? <CustomLesson content={activeLessonContent} /> : lectureContent || followingSlides ? <LessonSlides part={currentActivity} review={slideReview} lecture={lectureContent} /> : currentActivity === 6 ? renderQuiz() : isPracticeActivity(currentActivity) ? renderPractice(currentActivity) : currentActivity === 1 && role === 'teacher' && results ? <div ref={resultsRef} className="results-anchor"><div className="model-heading"><h2>Câu trả lời của các tổ · Hoạt động 1</h2></div><GoalAnswerResults teams={teams} /></div> : currentActivity === 1 ? <Suspense fallback={<div className="goal-viewer" />}><ActivityOne key={access ? `${access.code}-${access.number}` : role} embedded teacherPreview={role === 'teacher'} autoQuestion={autoQuestion} questionsVisible={role === 'teacher' || activityOneReleased} initialAnswers={student?.team.goal_answers} initialStep={student?.team.goal_step} initialCompleted={Boolean(student?.team.goal_completed_at)} timings={student?.team.goal_timings} serverNow={serverNow} closed={Boolean(student?.room.closed)} onDraft={role === 'student' && access ? async (step, answer) => { await draftGoal({ data: { ...access, step, answer } }); } : undefined} onSave={role === 'student' && access ? async (step, answer, completed) => { await saveGoal({ data: { ...access, step, answer, completed } }); await refresh(access); } : undefined} /></Suspense> : <ActivityTwo />}
      </PresentationNavigation.Provider>
      </PresentationFrame>
      <footer className="app-footer"><span>HÌNH HỌC 3D <span>·</span> Lớp học tương tác</span><span className="app-footer-author"><span>Tác giả: Đặng Vũ Cát Tường</span><span>Trường THPT Trần Văn Bảy - Cà Mau</span></span></footer>
    </main>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) { setDialog(null); setError(''); } }}><DialogContent><DialogTitle>{dialog === 'join' ? 'Tham gia lớp học' : 'Tạo lớp học mới'}</DialogTitle><DialogDescription>{dialog === 'join' ? 'Mã lớp do giáo viên cung cấp.' : 'Tạo buổi học cho các tổ.'}</DialogDescription><form className="form-stack" onSubmit={e => { e.preventDefault(); if (dialog === 'join') { if (joinInfo) void join(); else void lookup(); } else void makeRoom(); }}>{dialog === 'join' ? <><label>Mã lớp<Input value={code} onChange={e => { setCode(e.target.value); setKey(''); setJoinInfo(null); }} required minLength={4} maxLength={12} placeholder="Nhập mã lớp" /></label>{joinInfo && (joinInfo.individual || joinInfo.mode !== 'lecture') && (joinInfo.individual ? <label>Họ và tên<Input aria-label="Họ và tên" required minLength={2} maxLength={100} value={studentName} onChange={e => setStudentName(e.target.value)} autoComplete="name" /></label> : <label>Chọn tổ<select aria-label="Chọn tổ" className="entry-select" value={number} onChange={e => setNumber(Number(e.target.value))}>{joinInfo.numbers.map(n => <option key={n} value={n}>Tổ {n}</option>)}</select></label>)}</> : <><label>Tên lớp / buổi học<Input value={title} onChange={e => setTitle(e.target.value)} required /></label><label>Chế độ lớp học<select aria-label="Chế độ khi tạo lớp" className="entry-select" value={mode} onChange={e => setMode(e.target.value as LessonMode)}><option value="default">Thông thường</option><option value="lecture">Bài giảng</option><option value="presentation">Trình chiếu</option></select></label>{cubeLesson ? <p>Tối đa 45 học sinh · Tham gia bằng họ và tên</p> : <label>Số tổ (tối đa 10)<Input type="number" min={1} max={10} value={teamCount} onChange={e => setTeamCount(Number(e.target.value))} required /></label>}</>}{error && <p className="error-note" role="alert">{error}</p>}<Button disabled={busy} type="submit">{busy ? 'Đang xử lý…' : dialog === 'join' ? joinInfo ? 'Vào lớp học' : 'Tham gia lớp học' : 'Tạo lớp học'}<ArrowRight /></Button></form></DialogContent></Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={open => { if (!busy) setConfirmDelete(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xóa lớp học này?</AlertDialogTitle><AlertDialogDescription>{room ? `Lớp "${room.title}" · Mã ${room.code}` : ''} cùng toàn bộ bài làm của các tổ sẽ bị xóa và không thể khôi phục.</AlertDialogDescription></AlertDialogHeader>{error && <p className="error-note" role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Hủy</AlertDialogCancel><AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={e => { e.preventDefault(); void deleteRoom(); }}>{busy ? 'Đang xóa…' : 'Xóa lớp'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogTitle>Thông tin lớp học</DialogTitle><DialogDescription>Giáo viên cung cấp mã lớp. Học sinh nhập mã và chọn tổ, không cần tài khoản hay mã truy cập tổ. Các tổ nộp bài trước khi giáo viên công bố kết quả.</DialogDescription></DialogContent></Dialog>
  </>;
}