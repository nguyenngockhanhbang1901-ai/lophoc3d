import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Clock, Crown, Flag, Trophy, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnterReview } from '@/hooks/use-enter-review';
import { releaseState } from '@/lib/cube-practice';
import { QUIZ_GAME_NAME, QUIZ_LETTERS, QUIZ_QUESTIONS, QUIZ_SECONDS, QUIZ_STEPS, QUIZ_TITLE, type QuizLetter } from '@/lib/quiz-race';
import { QUIZ_SOLO_COUNT, soloStandings, soloTimeLabel, soloTimeMs, type SoloStanding } from '@/lib/quiz-solo';
import { answerQuizSolo, readQuizSolo, readQuizSoloResults, type QuizSoloAccess } from '@/lib/quiz-solo.functions';
import { clockLabel, remainingMs, timerTone } from '@/lib/timer';
import { MAX_CUBE_STUDENTS } from '@/lib/cube-practice';
import { QuizQuestion } from './QuizRace';
import { SlideArrows } from './SlideArrows';

const COUNT = QUIZ_SOLO_COUNT;
type Results = Awaited<ReturnType<typeof readQuizSoloResults>>;
type StudentState = Awaited<ReturnType<typeof readQuizSolo>>;

function Intro() {
  return <div className="quiz-intro"><span className="quiz-intro-icon"><Zap size={30} /></span><div><p className="eyebrow">{QUIZ_TITLE} · Mỗi học sinh tự làm</p><h2>{QUIZ_GAME_NAME}</h2><p>{COUNT} câu trắc nghiệm · mỗi câu {QUIZ_SECONDS} giây · bấm chọn A, B, C hoặc D. Bạn hoàn thành nhanh nhất đứng đầu bảng xếp hạng.</p></div></div>;
}

/** Ranking by fastest time: finished students first (shortest time on top), then those still playing. */
export function SoloRanking({ standings, showCorrect, released }: { standings: readonly SoloStanding[]; showCorrect: boolean; released: boolean }) {
  return <section className="quiz-race solo-ranking" aria-label="Bảng xếp hạng học sinh">
    <div className="quiz-race-head"><h3><Flag size={16} />Bảng xếp hạng · {QUIZ_GAME_NAME}</h3><span>{released ? 'Hoàn thành nhanh nhất đứng đầu · thời gian thực' : 'Chờ giao bài'}</span></div>
    {standings.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có học sinh nào vào lớp.</p> : <table className="solo-table">
      <thead><tr><th>Hạng</th><th>Họ và tên</th><th>Thời gian</th><th>{showCorrect ? 'Số câu đúng' : 'Tiến độ'}</th></tr></thead>
      <tbody>{standings.map((s, rank) => <tr key={s.slot} className={s.finished ? 'finished' : ''}>
        <td className="solo-rank">{s.finished && rank === 0 ? <Crown size={16} aria-label="Nhanh nhất" /> : rank + 1}</td>
        <td>{s.name}</td>
        <td className="solo-time">{s.finished ? soloTimeLabel(s.timeMs) : s.done ? <span className="text-muted-foreground">đang làm</span> : <span className="text-muted-foreground">chưa làm</span>}</td>
        <td>{showCorrect ? `${s.correct}/${COUNT}` : s.finished ? <><Trophy size={14} className="inline" /> Về đích</> : `${s.done}/${COUNT} câu`}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function useResults(roomId: string | undefined) {
  const read = useServerFn(readQuizSoloResults);
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!roomId) { setData(null); return; }
    let active = true;
    const update = async () => { try { const r = await read({ data: { roomId } }); if (active) { setData(r); setError(''); } } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Không đọc được bài làm'); } };
    void update(); const timer = setInterval(() => void update(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [roomId, read]);
  return { data, error };
}

function TeacherLive({ roomId }: { roomId?: string | undefined }) {
  const { selected } = useEnterReview(COUNT + 1);
  const { data, error } = useResults(roomId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const offset = data ? data.serverNow - Date.now() : 0;
  const released = Boolean(data?.releasedAt && Date.parse(data.releasedAt) <= now + offset);
  const standings = data ? soloStandings(data.rows, released ? data.releasedAt : null, now + offset) : [];
  return <div className="quiz-content quiz-teacher">
    <SlideArrows />
    {selected === 0 ? <Intro /> : <QuizQuestion index={selected - 1} />}
    {roomId && <><p className="text-sm text-muted-foreground"><Users size={14} className="inline" /> {data?.rows.length ?? 0}/{MAX_CUBE_STUDENTS} học sinh đã vào lớp</p><SoloRanking standings={standings} showCorrect={false} released={released} /></>}
    {error && <p role="alert" className="error-note">{error}</p>}
  </div>;
}

/** After SHOW ANSWER: question list on the left; the chosen question with its correct answer and how many picked each letter, then the final ranking. */
function TeacherResults({ roomId }: { roomId: string }) {
  const review = useEnterReview(COUNT + 1);
  useEffect(() => { review.select(0); }, []);
  const { data, error } = useResults(roomId);
  const offset = data ? data.serverNow - Date.now() : 0;
  const standings = data ? soloStandings(data.rows, data.releasedAt, Date.now() + offset) : [];
  const index = review.selected, last = index >= COUNT;
  const counts = QUIZ_LETTERS.map(letter => standings.filter(s => s.answers[index] === letter).length);
  const question = QUIZ_QUESTIONS[index];
  return <div className="lesson-layout goal-results-layout quiz-results">
    <aside className="sidebar">
      <p className="side-label">NỘI DUNG BÀI HỌC</p>
      <nav className="case-navigation" aria-label="Câu hỏi Luyện tập 3">
        {QUIZ_QUESTIONS.map((q, i) => <Button key={i} type="button" variant="ghost" className={`case-button ${i === index ? 'selected' : ''}`} aria-current={i === index ? 'step' : undefined} onClick={() => review.select(i)}>
          <span className="case-number">{i + 1}</span><span><strong>Câu {i + 1}</strong><small>Đáp án {q.correct}</small></span>
        </Button>)}
        <Button type="button" variant="ghost" className={`case-button ${last ? 'selected' : ''}`} aria-current={last ? 'step' : undefined} onClick={() => review.select(COUNT)}>
          <span className="case-number"><Trophy size={13} /></span><span><strong>Xếp hạng</strong><small>{QUIZ_GAME_NAME}</small></span>
        </Button>
      </nav>
    </aside>
    <section aria-label={last ? 'Xếp hạng học sinh' : `Kết quả câu ${index + 1}`}>
      <div className="model-heading"><h2>{last ? 'Xếp hạng' : `Câu ${index + 1}`}</h2></div>
      <div className="quiz-content">
        {!last && question ? <>
          <QuizQuestion index={index} showCorrect />
          <p className="solo-picks">{QUIZ_LETTERS.map((letter, i) => <span key={letter} className={letter === question.correct ? 'correct' : ''}>{letter}: {counts[i]} HS</span>)}<span>Bỏ trống: {standings.length - counts.reduce((a, b) => a + b, 0)} HS</span></p>
        </> : <div className="quiz-podium"><Trophy size={28} /><h2>Kết quả {QUIZ_GAME_NAME}</h2><p>{standings[0]?.finished ? `${standings[0].name} hoàn thành nhanh nhất: ${soloTimeLabel(standings[0].timeMs)} · ${standings[0].correct}/${COUNT} câu đúng.` : 'Chưa có học sinh nào hoàn thành.'}</p></div>}
        <SoloRanking standings={standings} showCorrect released />
        {error && <p role="alert" className="error-note">{error}</p>}
      </div>
    </section>
  </div>;
}

function Student({ access }: { access: QuizSoloAccess | null }) {
  const read = useServerFn(readQuizSolo), send = useServerFn(answerQuizSolo);
  const [state, setState] = useState<StudentState | null>(null);
  const [offset, setOffset] = useState(0), [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState<{ step: number; letter: QuizLetter } | null>(null);
  const [error, setError] = useState('');
  const refresh = async (a: QuizSoloAccess) => { const s = await read({ data: a }); setOffset(s.serverNow - Date.now()); setState(s); return s; };
  useEffect(() => {
    if (!access) { setState(null); return; }
    let active = true;
    const update = async () => { try { const s = await read({ data: access }); if (active) { setOffset(s.serverNow - Date.now()); setState(s); } } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Không đọc được bài'); } };
    void update(); const timer = setInterval(() => void update(), 1500);
    return () => { active = false; clearInterval(timer); };
  }, [access, read]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  useEffect(() => { setSending(s => s && s.step === state?.step ? s : null); }, [state?.step]);
  const serverNow = now + offset;
  const gate = state?.released ? { released: true, countdown: null, remaining: null } : releaseState(state?.release_at, serverNow);
  if (!gate.released) return <section className="cube-practice"><Intro /><div className="cube-release-wait" role="status" aria-live="polite">{gate.countdown ? <><p>Bài sẽ mở sau</p><span className="cube-countdown" key={gate.countdown}>{gate.countdown}</span></> : <><Clock size={40} /><h2>Đợi giáo viên giao bài{gate.remaining && <span className="cube-release-clock" aria-hidden="true">còn {gate.remaining}</span>}</h2>{state?.name && <p>{state.name}</p>}</>}</div>{error && <p role="alert" className="error-note">{error}</p>}</section>;
  if (!state) return <div className="quiz-content"><Intro /></div>;
  if (state.completedAt) {
    const done = state.answers.filter(Boolean).length;
    const time = soloTimeMs({ answers: state.answers, step: state.step, completedAt: state.completedAt, timings: state.timings });
    return <div className="quiz-content"><div className="goal-completion" role="status"><span className="goal-completion-icon"><Flag size={26} /></span><div><p className="eyebrow">VỀ ĐÍCH · {state.name}</p><h3>Em đã hoàn thành {QUIZ_GAME_NAME} trong {soloTimeLabel(time)}.</h3><p>Đã chọn đáp án cho {done}/{COUNT} câu · Không thể sửa. Theo dõi bảng xếp hạng trên màn hình của giáo viên.</p></div></div></div>;
  }
  const index = Math.min(state.step, COUNT - 1);
  const ms = remainingMs(state.timings[index]?.started_at ?? null, serverNow, QUIZ_STEPS.limitMs);
  const pending = sending?.step === index ? sending.letter : null;
  const disabled = Boolean(pending) || state.closed || ms <= 0 || !access;
  const choose = async (letter: QuizLetter) => {
    if (!access || disabled) return;
    setSending({ step: index, letter }); setError('');
    try { await send({ data: { ...access, step: index, answer: letter } }); await refresh(access); } catch (e) { setSending(null); setError(e instanceof Error ? e.message : 'Không gửi được đáp án'); void refresh(access).catch(() => {}); }
  };
  return <div className="quiz-content quiz-student">
    {state.name && <p><strong>{state.name}</strong></p>}
    <QuizQuestion index={index} chosen={pending} onChoose={letter => { void choose(letter); }} disabled={disabled} timer={<span role="timer" aria-label="Thời gian còn lại" className={`question-timer ${ms <= 0 ? 'ended' : timerTone(ms)}`}>{ms <= 0 ? 'Hết giờ' : clockLabel(ms)}</span>} />
    {error && <p className="error-note" role="alert">{error}</p>}
    <p className="status quiz-status"><span className="goal-status-dot" />{pending ? `Đã chọn ${pending} · đang chuyển câu…` : ms <= 0 ? 'Hết giờ · đang chuyển câu…' : 'Bấm vào một đáp án để gửi ngay · Đã gửi thì không thể sửa'}</p>
  </div>;
}

/** Bài 12.1 · Luyện tập 3 played individually: teacher sees the live ranking (fastest first), students play on their own clock. */
export function QuizSolo({ teacher, roomId, review, access }: { teacher: boolean; roomId?: string | undefined; review: boolean; access: QuizSoloAccess | null }) {
  return <section className="quiz-solo">
    <div className="model-heading"><h2>{QUIZ_TITLE} · {QUIZ_GAME_NAME}</h2></div>
    {teacher ? review && roomId ? <TeacherResults roomId={roomId} /> : <TeacherLive roomId={roomId} /> : <Student access={access} />}
  </section>;
}
