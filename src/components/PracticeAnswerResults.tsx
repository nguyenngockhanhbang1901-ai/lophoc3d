import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnterReview } from '@/hooks/use-enter-review';
import { PRACTICE_SETS, questionTitle, type PracticeSet } from '@/lib/practice-questions';
import { MathText } from './MathText';
import { PracticeFigure } from './PracticeFigure';

export type PracticeTeamAnswers = { number: number; answers: unknown; timings?: unknown };

/** Practice / Hoạt động 3 review: pick a question; the picture sits on top, the question and every team's answer below. */
export function PracticeAnswerResults({ teams, set = PRACTICE_SETS[3], onFinish }: { teams: PracticeTeamAnswers[]; set?: PracticeSet; onFinish?: () => void }) {
  const { selected, armed, select } = useEnterReview(set.questions.length, onFinish);
  const [correctFor, setCorrectFor] = useState<number | null>(null);
  const showCorrect = correctFor === selected;
  const question = set.questions[selected]!;
  const orderedTeams = [...teams].sort((a, b) => a.number - b.number);
  const lastHint = onFinish ? (armed ? 'Nhấn Enter lần nữa để kết thúc' : 'Nhấn Enter hai lần để kết thúc') : '';
  const single = set.questions.length === 1;
  return <div className={`lesson-layout goal-results-layout practice-review ${single ? 'practice-review-single' : ''}`}>
    {!single && <aside className="sidebar">
      <p className="side-label">NỘI DUNG BÀI HỌC</p>
      <nav className="case-navigation" aria-label={`Câu hỏi ${set.title}`}>
        {set.questions.map((item, index) =>
        <Button key={item.label} variant="ghost" className={`case-button ${index === selected ? 'selected' : ''}`} aria-current={index === selected ? 'step' : undefined} onClick={() => { select(index); setCorrectFor(null); }}>
          <span className="case-number">{item.label}</span><span><strong>{questionTitle(set, item).replace(')', '')}</strong><small>{item.focusLabel}</small></span>
        </Button>)}
      </nav>
    </aside>}
    <section aria-label={`Kết quả ${questionTitle(set, question)}`}>
      {!single && <div className="model-heading"><h2>{questionTitle(set, question)}</h2><span className="goal-enter-hint" aria-live="polite">{selected < set.questions.length - 1 ? 'Nhấn Enter để sang câu tiếp theo' : lastHint}</span></div>}
      <div className="practice-review-body">
        <PracticeFigure set={set} compact highlight={question.focus} />
        <div className="practice-review-text">
          <h3>{question.prompt}</h3>
          <div className="goal-team-answers">
            {orderedTeams.map(team => {
              const answers = Array.isArray(team.answers) ? team.answers : [];
              const answer: unknown = answers[selected];
              const timing: unknown = Array.isArray(team.timings) ? team.timings[selected] : null;
              const ended = Boolean(set.seconds && timing && typeof timing === 'object' && (timing as { ended_at?: string | null }).ended_at);
              return <div className="result-answer compact" key={team.number}><strong>Tổ {team.number}:</strong> {typeof answer === 'string' && answer.trim() ? answer.trim() : ended ? 'Hết giờ · Chưa trả lời' : 'Chưa có câu trả lời'}</div>;
            })}
          </div>
          <div className="practice-correct-row">
            <Button size="sm" variant="outline" onClick={() => setCorrectFor(showCorrect ? null : selected)}>{showCorrect ? <EyeOff /> : <Eye />}{showCorrect ? 'Ẩn đáp án đúng' : 'Hiện đáp án đúng'}</Button>
            {showCorrect && <div className="correct-answer"><MathText text={question.answer} /></div>}
          </div>
        </div>
      </div>
    </section>
  </div>;
}
