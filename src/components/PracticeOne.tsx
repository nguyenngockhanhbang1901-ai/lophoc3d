import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Clock, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PRACTICE_PLACEHOLDER, PRACTICE_SETS, questionTitle, type PracticeQuestion, type PracticeSet } from '@/lib/practice-questions';
import { clockLabel, remainingMs, timerTone, type Timing } from '@/lib/timer';
import { PracticeFigure } from './PracticeFigure';
import { useEnterReview } from '@/hooks/use-enter-review';
import { useFollowSharedQuestion } from '@/hooks/use-follow-question';

/** Compact a · b · c strip shown under the question. */
function PracticeSteps({ questions, current, done, disabled, onSelect }: { questions: readonly PracticeQuestion[]; current: number | null; done?: (i: number) => boolean; disabled?: (i: number) => boolean; onSelect?: (i: number) => void }) {
  if (questions.length < 2) return null;
  return <nav className="practice-steps" aria-label="Danh sách câu hỏi">
    {questions.map((item, i) => <Button key={item.label} type="button" size="sm" variant="ghost" aria-label={`Câu ${item.label}`} aria-current={i === current ? 'step' : undefined} className={`practice-step ${i === current ? 'selected' : ''} ${done?.(i) ? 'done' : ''}`} disabled={disabled?.(i)} onClick={() => onSelect?.(i)}>
      {done?.(i) ? <Check /> : null}{item.label}
    </Button>)}
  </nav>;
}

function TeacherPracticePreview({ set, autoQuestion }: { set: PracticeSet; autoQuestion?: number | null | undefined }) {
  const single = set.questions.length === 1;
  const review = useEnterReview(set.questions.length + 1);
  // While the work runs, the shared screen follows the question every team has reached.
  useFollowSharedQuestion(autoQuestion, review.select);
  const selected = review.selected === 0 ? null : review.selected - 1;
  const question = selected === null ? null : set.questions[selected];
  return <div className="goal-content goal-content-embedded practice-content practice-teacher">
    <PracticeFigure set={set} highlight={question?.focus ?? null} />
    <section className="practice-workspace" aria-label={`Câu hỏi ${set.title}`}>
      {!single && <p className="practice-context">{set.prompt}</p>}
      {question && <h3 className="practice-question-prompt" role="status">{!single && <strong>{questionTitle(set, question)} </strong>}{question.prompt}</h3>}
      <PracticeSteps questions={set.questions} current={selected} onSelect={index => review.select(index + 1)} />
    </section>
  </div>;
}

export type PracticeOneProps = {
  set?: PracticeSet;
  teacherPreview?: boolean;
  questionsVisible?: boolean;
  /** Teacher view while the work runs: the question all teams have reached, shown automatically. */
  autoQuestion?: number | null | undefined;
  initialAnswers?: string[] | undefined;
  initialStep?: number | undefined;
  initialCompleted?: boolean;
  timings?: Timing[] | undefined;
  serverNow?: number;
  closed?: boolean;
  onDraft?: ((step: number, answer: string) => Promise<void>) | undefined;
  onSave?: ((step: number, answer: string) => Promise<void>) | undefined;
};

export default function PracticeOne({ set = PRACTICE_SETS[3], teacherPreview = false, questionsVisible = true, autoQuestion, initialAnswers, initialStep = 0, initialCompleted = false, timings, serverNow = 0, closed = false, onDraft, onSave }: PracticeOneProps) {
  const questions = set.questions;
  const last = questions.length - 1;
  const clamp = (n: number) => Math.max(0, Math.min(n, last));
  const [index, setIndex] = useState(clamp(initialStep));
  const [answers, setAnswers] = useState<string[]>(() => questions.map((_, i) => initialAnswers?.[i] ?? ''));
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // synced: the server stores this team's progress; managed: it also runs a clock for each question.
  const synced = Boolean(onSave);
  const managed = Boolean(onSave && timings && set.seconds);
  const step = clamp(initialStep);
  const ms = remainingMs(timings?.[step]?.started_at ?? null, serverNow, (set.seconds ?? 0) * 1000);
  const locked = closed || completed || (synced && index !== step) || (managed && ms <= 0);
  const root = useRef<HTMLDivElement>(null);
  // The server owns progress: follow its current question, keeping what the student is typing now.
  useEffect(() => {
    if (!synced) return;
    setIndex(step); setCompleted(initialCompleted);
    setAnswers(previous => questions.map((_, i) => i === step && !initialCompleted ? previous[i] ?? initialAnswers?.[i] ?? '' : initialAnswers?.[i] ?? ''));
  }, [synced, step, initialCompleted]);
  // On phones, bring picture + question + answer box into one screen as soon as the work is handed out.
  useEffect(() => {
    if (teacherPreview || !questionsVisible || !window.matchMedia('(max-width: 700px), (orientation: portrait)').matches) return;
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [teacherPreview, questionsVisible]);
  const draft = useRef(onDraft);
  draft.current = onDraft;
  useEffect(() => {
    if (!managed || locked || !questionsVisible) return;
    const timer = window.setTimeout(() => { void draft.current?.(index, answers[index] ?? '').catch(() => {}); }, 300);
    return () => window.clearTimeout(timer);
  }, [managed, index, answers, locked, questionsVisible]);

  if (teacherPreview) return <TeacherPracticePreview set={set} autoQuestion={autoQuestion} />;
  const question = questions[index] ?? questions[0]!;
  const answer = answers[index] ?? '';
  const send = async () => {
    if (!answer.trim() || saving || locked) return;
    setSaving(true); setSaveError('');
    try { await onSave?.(index, answer); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Không gửi được câu trả lời'); setSaving(false); return; }
    setSaving(false);
    if (synced) return;
    if (index === last) setCompleted(true); else setIndex(index + 1);
  };
  const status = synced ? 'Đã gửi thì không thể sửa' : 'Tham gia lớp học để gửi đáp án';
  const single = questions.length === 1;

  return <div ref={root} className={`goal-content goal-content-embedded practice-content ${synced ? 'practice-timed' : ''}`}>
    <PracticeFigure set={set} highlight={completed || !questionsVisible ? null : question.focus} />
    {!questionsVisible ? <section className="goal-waiting" role="status"><Clock size={24} /><div><h2>Chờ giáo viên bắt đầu giao bài</h2><p>Em có thể quan sát {set.figure === 'photo' ? 'bức ảnh' : "hình hộp chữ nhật ABCD.A'B'C'D'"}. Câu hỏi sẽ hiện ra sau khi giáo viên giao bài.</p></div></section> : <section className="practice-workspace" aria-labelledby="practice-question-heading">
      {completed ? <div className="goal-completion" role="status"><span className="goal-completion-icon"><Check size={26} /></span><div><p className="eyebrow">HOÀN THÀNH</p><h3 id="practice-question-heading">Đã gửi đáp án cho giáo viên.</h3><p>Bài làm đã được lưu · Không thể sửa.</p></div></div> : <>
        {!single && <div className="practice-question-head"><h2 id="practice-question-heading">{questionTitle(set, question)}</h2>{managed && <span role="timer" aria-label="Thời gian còn lại" className={`question-timer ${timerTone(ms)}`}>{clockLabel(ms)}</span>}</div>}
        <h3 id={single ? 'practice-question-heading' : undefined} className="practice-question-prompt">{question.prompt}</h3>
        <PracticeSteps questions={questions} current={index} done={i => Boolean((answers[i] ?? '').trim()) && i < index} disabled={i => saving || synced || i > index} onSelect={setIndex} />
        {set.figure !== 'photo' && <><Textarea id="practice-answer" aria-label={`Câu trả lời ${questionTitle(set, question)}`} className="answer-field practice-answer-field" placeholder={PRACTICE_PLACEHOLDER} disabled={saving || locked} value={answer} onChange={event => { if (locked) return; setAnswers(answers.map((value, i) => i === index ? event.target.value : value)); setSaveError(''); }} />
        {saveError && <p className="error-note" role="alert">{saveError}</p>}
        <div className="action-row practice-actions"><span className="status"><span className="goal-status-dot" />{status}</span><div className="flex gap-2">{index > 0 && !synced && <Button variant="outline" disabled={saving} onClick={() => setIndex(index - 1)}><ChevronLeft />Quay lại</Button>}<Button disabled={saving || locked || !answer.trim()} onClick={() => { void send(); }}>{saving ? 'Đang gửi…' : index === last ? 'Gửi đáp án · Nộp bài' : 'Gửi đáp án · Câu tiếp theo'}{index === last ? <Send /> : <ArrowRight />}</Button></div></div></>}
      </>}
    </section>}
  </div>;
}
