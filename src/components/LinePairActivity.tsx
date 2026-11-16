import { lazy, Suspense, useContext, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { useEnterReview } from '@/hooks/use-enter-review';
import { PresentationNavigation } from '@/lib/presentation-navigation';
import { PAIR_ANSWERS, PAIR_QUESTIONS, type PairKind } from '@/lib/line-pairs';
import { clockLabel, remainingMs, type Timing } from '@/lib/timer';
import { reveal } from '@/lib/reveal';
import { MathText } from './MathText';
const LinePairView = lazy(() => import('./LinePairView'));
type Props = { teacher: boolean; lecture?: boolean; released: boolean; review: boolean; step: number; answers: string[]; timings: Timing[]; completed: boolean; closed: boolean; now: number; teams: { number: number; goal_answers: unknown }[]; onSave?: ((step: number, answer: string) => Promise<void>) | undefined; onDraft?: ((step: number, answer: string) => Promise<void>) | undefined };
export function LinePairActivity(props: Props) {
  const navigation = useContext(PresentationNavigation);
  // Students follow server question progress; keyboard presentation never submits their answers.
  return <PresentationNavigation.Provider value={props.teacher || props.lecture ? navigation : { ...navigation, readOnly: true }}><Content {...props} /></PresentationNavigation.Provider>;
}
function Content(p: Props) {
  const { selected, select } = useEnterReview(p.review || p.lecture ? 12 : 7);
  const question = p.teacher || p.lecture ? p.review || p.lecture ? Math.floor(selected / 2) : selected - 1 : p.step;
  const showAnswer = Boolean(p.lecture || p.review && selected % 2 === 1);
  const skew = question >= 4;
  const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setDraft(p.answers[p.step] ?? ''); }, [p.step]);
  const ms = remainingMs(p.timings[p.step]?.started_at ?? null, p.now, 90_000);
  const locked = !p.released || p.completed || p.closed || ms === 0 || !p.onSave;
  useEffect(() => { if (locked || !p.onDraft) return; const t = window.setTimeout(() => { void p.onDraft?.(p.step, draft).catch(() => {}); }, 300); return () => clearTimeout(t); }, [draft, p.step, locked]);
  const kinds: PairKind[] = skew ? ['skew'] : ['parallel', 'intersecting', 'coincident'];
  const studentAnswer = (i: number) => !p.teacher && !p.lecture && p.released ? <div className="pair-student-answer">
    {i === p.step && !p.completed && <span className="question-timer" role="timer">{clockLabel(ms)}</span>}
    <Textarea aria-label={`Câu trả lời câu ${i + 1}`} className="answer-field" value={i === p.step && !p.completed ? draft : p.answers[i] ?? ''} disabled={i !== p.step || locked || busy} onChange={e => setDraft(e.target.value)} />
    {i === p.step && !p.completed && <Button disabled={locked || busy || !draft.trim()} onClick={() => { setBusy(true); setError(''); void p.onSave?.(p.step, draft).catch(e => setError(e instanceof Error ? e.message : 'Không gửi được đáp án')).finally(() => setBusy(false)); }}><Send />{p.step === 5 ? 'Nộp bài' : 'Gửi đáp án · Câu tiếp theo'}</Button>}
    {i === p.step && error && <p role="alert" className="error-note">{error}</p>}
  </div> : null;
  const prompt = (i: number) => <><h3 className="practice-question-prompt"><strong>Câu {i + 1}. </strong><MathText text={PAIR_QUESTIONS[i] ?? ''} /></h3>{studentAnswer(i)}</>;
  return <div className="line-pair-activity">
    {(p.teacher || p.lecture) && <div className="model-heading slide-arrows"><span className="ml-auto" /><Button size="sm" variant="ghost" aria-label="Bước trước" onClick={() => select(selected - 1)} disabled={selected === 0}><ArrowLeft /></Button><Button size="sm" variant="ghost" aria-label="Bước tiếp theo" onClick={() => select(selected + 1)} disabled={selected === (p.review || p.lecture ? 11 : 6)}><ArrowRight /></Button></div>}
    <div className={`models-row ${skew ? 'line-pair-single' : ''}`}>{kinds.map((kind, i) => <section key={kind}><Suspense fallback={<div className="geometry-view compact" />}><LinePairView kind={kind} /></Suspense>{!skew && <div {...reveal(question >= i && (p.teacher || p.lecture || p.released))}>{prompt(i)}{showAnswer && question === i && <p className="correct-answer"><MathText text={PAIR_ANSWERS[i] ?? ''} /></p>}</div>}</section>)}</div>
    {question >= 3 && (p.teacher || p.lecture || p.released) && <section className="practice-workspace">{prompt(question)}{showAnswer && <p className="correct-answer"><MathText text={PAIR_ANSWERS[question] ?? ''} /></p>}</section>}
    {p.teacher && p.review && question >= 0 && <div className="team-answers-grid">{p.teams.map(t => <div className="team-answer" key={t.number}><strong>Tổ {t.number}</strong><p>{Array.isArray(t.goal_answers) ? t.goal_answers[question] || 'Chưa trả lời' : 'Chưa trả lời'}</p></div>)}</div>}
    {!p.teacher && !p.lecture && (!p.released || p.completed) && <section className="practice-workspace"><p role="status">{!p.released ? 'Chờ giáo viên bắt đầu giao bài' : 'Đã nộp bài · Không thể sửa.'}</p></section>}
  </div>;
}