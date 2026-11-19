import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Clock, Crown, Flag, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnterReview } from '@/hooks/use-enter-review';
import { useFollowSharedQuestion } from '@/hooks/use-follow-question';
import { finalStandings, QUIZ_GAME_NAME, QUIZ_LETTERS, QUIZ_QUESTIONS, QUIZ_SECONDS, QUIZ_STEPS, QUIZ_TITLE, raceBar, raceLeader, raceStandings, type QuizLetter, type RaceLane } from '@/lib/quiz-race';
import type { StepProgress } from '@/lib/goal-progress';
import { clockLabel, remainingMs, timerTone, type Timing } from '@/lib/timer';
import { reveal } from '@/lib/reveal';
import { MathText } from './MathText';
import { QuizFigure } from './QuizFigure';

const COUNT = QUIZ_QUESTIONS.length;

/** `**text**` marks a stressed word (e.g. "sai"); everything else goes through MathText. */
function Prompt({ text }: { text: string }) {
  return <>{text.split('**').map((part, i) => i % 2 ? <strong key={i} className="quiz-stress"><MathText text={part} /></strong> : <Fragment key={i}><MathText text={part} /></Fragment>)}</>;
}

export type QuizPicks = Partial<Record<QuizLetter, number[]>>;
/** One question. With a figure: prompt and stacked A–D answers on the left, the static figure on the right; phones stack figure → prompt → answers. */
export function QuizQuestion({ index, chosen, onChoose, disabled, showCorrect = false, picks, timer, hideOptions = false }: { index: number; chosen?: string | null; onChoose?: (letter: QuizLetter) => void; disabled?: boolean; showCorrect?: boolean; picks?: QuizPicks; timer?: React.ReactNode; hideOptions?: boolean }) {
  const question = QUIZ_QUESTIONS[index]!;
  return <div className={`quiz-layout ${question.figure ? 'quiz-with-figure' : ''}`}>
    <section className="quiz-question" aria-labelledby={`quiz-q-${index}`}>
      <div className="quiz-question-head"><span className="quiz-number">Câu {index + 1}<small>/{COUNT}</small></span>{timer}</div>
      <h3 id={`quiz-q-${index}`} className="quiz-prompt"><Prompt text={question.prompt} /></h3>
    </section>
    {question.figure && <QuizFigure figure={question.figure} />}
    <div className="quiz-options" role="group" aria-label={`Đáp án câu ${index + 1}`} {...reveal(!hideOptions)}>
      {question.options.map((option, i) => {
        const letter = QUIZ_LETTERS[i]!;
        const correct = showCorrect && letter === question.correct;
        const state = correct ? 'correct' : showCorrect ? 'dim' : chosen === letter ? 'chosen' : '';
        return <button key={letter} type="button" className={`quiz-option quiz-option-${letter.toLowerCase()} ${state}`} aria-pressed={chosen === letter || undefined} disabled={disabled || !onChoose} onClick={() => onChoose?.(letter)}>
          <span className="quiz-letter">{correct ? <Check size={18} /> : letter}</span>
          <span className="quiz-option-text"><MathText text={option} /></span>
          {picks && (picks[letter]?.length ?? 0) > 0 && <span className="quiz-picks">{picks[letter]!.map(n => <span key={n}>Tổ {n}</span>)}</span>}
        </button>;
      })}
    </div>
  </div>;
}

function GameIntro() {
  return <div className="quiz-intro"><span className="quiz-intro-icon"><Zap size={30} /></span><div><p className="eyebrow">{QUIZ_TITLE} · Trò chơi củng cố kiến thức</p><h2>{QUIZ_GAME_NAME}</h2><p>{COUNT} câu trắc nghiệm · mỗi câu {QUIZ_SECONDS} giây · bấm chọn A, B, C hoặc D. Tổ trả lời nhanh hơn sẽ dẫn đầu đường đua.</p></div></div>;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** When the order changes, each lane slides from its old row to its new one (FLIP), so an overtaking team visibly moves up. */
function useLaneSlide(order: string) {
  const rows = useRef(new Map<number, HTMLLIElement>());
  const tops = useRef(new Map<number, number>());
  useIsoLayoutEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rows.current.forEach((el, team) => {
      const top = el.offsetTop, before = tops.current.get(team);
      tops.current.set(team, top);
      if (still || before === undefined || before === top) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${before - top}px)`;
      el.classList.toggle('overtaking', before > top);
      void el.offsetHeight;
      requestAnimationFrame(() => { el.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
      window.setTimeout(() => el.classList.remove('overtaking'), 750);
    });
  }, [order]);
  return (team: number) => (el: HTMLLIElement | null) => { if (el) rows.current.set(team, el); else rows.current.delete(team); };
}

/** Race track: one lane per team, most correct (then fastest) on top with a crown; the bar is green for correct answers, then red for wrong ones. */
export function RaceTrack({ lanes, showCorrect = false, released = true }: { lanes: readonly RaceLane[]; showCorrect?: boolean; released?: boolean }) {
  const leader = raceLeader(lanes);
  const rowRef = useLaneSlide(lanes.map(l => l.number).join(','));
  return <section className="quiz-race" aria-label="Đường đua các tổ">
    <div className="quiz-race-head"><h3><Flag size={16} />Đường đua · {QUIZ_GAME_NAME}</h3><span>{released ? showCorrect ? 'Xếp hạng theo số câu đúng' : 'Đúng nhiều nhất, nhanh nhất dẫn đầu · thời gian thực' : 'Chờ giao bài'}</span></div>
    <ol className="quiz-lanes">
      {lanes.map((lane, rank) => {
        const bar = raceBar(lane);
        const at = `${(bar.correct + bar.wrong) * 100}%`;
        return <li key={lane.number} ref={rowRef(lane.number)} className={`quiz-lane ${lane.number === leader ? 'leader' : ''} ${lane.finished ? 'finished' : ''}`}>
          <span className="quiz-rank">{rank + 1}</span>
          <strong className="quiz-team">Tổ {lane.number}</strong>
          <div className="quiz-track" role="progressbar" aria-label={`Tổ ${lane.number}: ${lane.correct} câu đúng, ${lane.done - Math.min(lane.correct, lane.done)} câu sai`} aria-valuemin={0} aria-valuemax={COUNT} aria-valuenow={lane.done}>
            {Array.from({ length: COUNT - 1 }, (_, i) => <span key={i} className="quiz-notch" style={{ left: `${((i + 1) / COUNT) * 100}%` }} />)}
            <span className="quiz-fill quiz-fill-correct" style={{ width: `${bar.correct * 100}%` }} />
            <span className="quiz-fill quiz-fill-wrong" style={{ left: `${bar.correct * 100}%`, width: `${bar.wrong * 100}%` }} />
            <span className="quiz-car" style={{ left: at }}>
              {lane.number === leader && <Crown className="quiz-crown" size={20} aria-label="Dẫn đầu" />}
              {lane.finished ? <Trophy size={16} /> : <Zap size={16} />}
            </span>
          </div>
          <span className="quiz-score">{showCorrect ? `${lane.correct}/${COUNT} đúng` : <>{lane.correct} đúng<small>{lane.done}/{COUNT} câu</small></>}</span>
        </li>;
      })}
    </ol>
  </section>;
}

export type QuizTeam = { number: number; progress: StepProgress };
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return; const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, [active]);
  return now;
}

/** Teacher's screen: Enter steps through the game; once handed out it follows the question every team has reached. The race track sits below. */
export function QuizTeacher({ teams, releasedAt, autoQuestion }: { teams: readonly QuizTeam[]; releasedAt: string | null; autoQuestion: number | null }) {
  const review = useEnterReview(COUNT + 1);
  useFollowSharedQuestion(autoQuestion, review.select);
  const now = useNow(Boolean(releasedAt));
  const lanes = raceStandings(teams, releasedAt, now);
  const index = review.selected - 1;
  return <div className="quiz-content quiz-teacher">
    {index < 0 ? <GameIntro /> : <QuizQuestion index={index} />}
    {releasedAt && <RaceTrack lanes={lanes} />}
  </div>;
}

/** After SHOW ANSWER: laid out like the other parts' results — question list on the left, the chosen question with its correct answer and each team's pick on the right, then the final ranking. */
export function QuizResults({ teams, releasedAt }: { teams: readonly QuizTeam[]; releasedAt: string | null }) {
  const review = useEnterReview(COUNT + 1);
  // Published results always open on Câu 1, whatever question the live game ended on.
  useEffect(() => { review.select(0); }, []);
  const lanes = finalStandings(raceStandings(teams, releasedAt, Date.now()));
  const index = review.selected;
  const picks: QuizPicks = {};
  if (index < COUNT) for (const t of teams) { const a = t.progress.answers[index]; if (a && QUIZ_LETTERS.includes(a as QuizLetter)) (picks[a as QuizLetter] ??= []).push(t.number); }
  const last = index >= COUNT;
  return <div className="lesson-layout goal-results-layout quiz-results">
    <aside className="sidebar">
      <p className="side-label">NỘI DUNG BÀI HỌC</p>
      <nav className="case-navigation" aria-label="Câu hỏi Luyện tập 3">
        {QUIZ_QUESTIONS.map((q, i) => <Button key={i} type="button" variant="ghost" className={`case-button ${i === index ? 'selected' : ''}`} aria-label={`Câu ${i + 1}`} aria-current={i === index ? 'step' : undefined} onClick={() => review.select(i)}>
          <span className="case-number">{i + 1}</span><span><strong>Câu {i + 1}</strong><small>Đáp án {q.correct}</small></span>
        </Button>)}
        <Button type="button" variant="ghost" className={`case-button ${last ? 'selected' : ''}`} aria-label="Xếp hạng" aria-current={last ? 'step' : undefined} onClick={() => review.select(COUNT)}>
          <span className="case-number"><Trophy size={13} /></span><span><strong>Xếp hạng</strong><small>{QUIZ_GAME_NAME}</small></span>
        </Button>
      </nav>
    </aside>
    <section aria-label={last ? 'Xếp hạng các tổ' : `Kết quả câu ${index + 1}`}>
      <div className="model-heading"><h2>{last ? 'Xếp hạng' : `Câu ${index + 1}`}</h2></div>
      <div className="quiz-content">
        {!last ? <QuizQuestion index={index} showCorrect picks={picks} /> : <div className="quiz-podium"><Trophy size={28} /><h2>Kết quả {QUIZ_GAME_NAME}</h2><p>{lanes[0] && lanes[0].done > 0 ? `Tổ ${lanes[0].number} dẫn đầu với ${lanes[0].correct}/${COUNT} câu đúng.` : 'Chưa có tổ nào trả lời.'}</p></div>}
        <RaceTrack lanes={lanes} showCorrect />
      </div>
    </section>
  </div>;
}

/** Lecture / review slides: each question first, then its correct answer on the next Enter. */
export function QuizLecture() {
  const { selected } = useEnterReview(COUNT * 2 + 1);
  if (selected === 0) return <div className="quiz-content"><GameIntro /></div>;
  const index = Math.floor((selected - 1) / 2);
  return <div className="quiz-content"><QuizQuestion index={index} showCorrect={selected % 2 === 0} /></div>;
}

/** A team's game screen: tap a letter to send it; the next question appears when the server moves the team on. */
export function QuizStudent({ released, step, answers, timings, completed, closed, serverNow, onAnswer }: { released: boolean; step: number; answers: readonly string[]; timings: readonly Timing[]; completed: boolean; closed: boolean; serverNow: number; onAnswer?: ((step: number, letter: QuizLetter) => Promise<void>) | undefined }) {
  const [sending, setSending] = useState<{ step: number; letter: QuizLetter } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setSending(s => s && s.step === step ? s : null); }, [step]);
  if (!released) return <div className="quiz-content"><GameIntro /><section className="goal-waiting" role="status"><Clock size={24} /><div><h2>Chờ giáo viên bắt đầu giao bài</h2><p>Khi giáo viên giao bài, câu hỏi đầu tiên sẽ hiện ra. Mỗi câu có {QUIZ_SECONDS} giây.</p></div></section></div>;
  if (completed) {
    const done = answers.filter(Boolean).length;
    return <div className="quiz-content"><div className="goal-completion" role="status"><span className="goal-completion-icon"><Flag size={26} /></span><div><p className="eyebrow">VỀ ĐÍCH</p><h3>Tổ em đã hoàn thành {QUIZ_GAME_NAME}.</h3><p>Đã chọn đáp án cho {done}/{COUNT} câu · Không thể sửa. Theo dõi kết quả trên màn hình của giáo viên.</p></div></div></div>;
  }
  const index = Math.min(step, COUNT - 1);
  const ms = remainingMs(timings[index]?.started_at ?? null, serverNow, QUIZ_STEPS.limitMs);
  const pending = sending?.step === index ? sending.letter : null;
  const choose = async (letter: QuizLetter) => {
    if (!onAnswer || pending || closed || ms <= 0) return;
    setSending({ step: index, letter }); setError('');
    try { await onAnswer(index, letter); } catch (e) { setSending(null); setError(e instanceof Error ? e.message : 'Không gửi được đáp án'); }
  };
  return <div className="quiz-content quiz-student">
    <QuizQuestion index={index} chosen={pending} onChoose={letter => { void choose(letter); }} disabled={Boolean(pending) || closed || ms <= 0 || !onAnswer} timer={<span role="timer" aria-label="Thời gian còn lại" className={`question-timer ${ms <= 0 ? 'ended' : timerTone(ms)}`}>{ms <= 0 ? 'Hết giờ' : clockLabel(ms)}</span>} />
    {error && <p className="error-note" role="alert">{error}</p>}
    <p className="status quiz-status"><span className="goal-status-dot" />{pending ? `Đã chọn ${pending} · đang chuyển câu…` : 'Bấm vào một đáp án để gửi ngay · Đã gửi thì không thể sửa'}</p>
  </div>;
}
