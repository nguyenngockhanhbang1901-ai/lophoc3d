import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { GOAL_QUESTIONS } from '@/lib/goal-questions';

export const GOAL_SUMMARY_QUESTION = 'Dựa vào kết quả trên, em hãy cho biết một đường thẳng và một mặt phẳng có thể có bao nhiêu điểm chung?';
export const GOAL_SUMMARY_ANSWER = 'Một đường thẳng và một mặt phẳng có thể có một, không có hoặc vô số điểm chung.';
import { useEnterReview } from '@/hooks/use-enter-review';
import { reveal } from '@/lib/reveal';

// The 3D viewer pulls in three.js, so it loads lazily like the rest of Activity 1.
const GoalModelViewer = lazy(() => import('./ActivityOne').then(module => ({ default: module.GoalModelViewer })));

const MODEL_ANSWERS = ['Xà ngang nằm ngoài mặt sân.', 'Không có điểm chung.', 'Có một điểm chung.', 'Có một điểm chung.', 'Thanh đáy nằm trong mặt sân.', 'Có vô số điểm chung.'];
export function GoalAnswerResults({ teams, onFinish, lessonAnswers = false }: { teams: { number: number; goal_answers: unknown }[]; onFinish?: () => void; lessonAnswers?: boolean }) {
  const { selected: stage, select: selectStage } = useEnterReview((lessonAnswers ? GOAL_QUESTIONS.length * 2 : GOAL_QUESTIONS.length) + 2, onFinish, false);
  const selected = lessonAnswers ? stage < GOAL_QUESTIONS.length * 2 ? Math.floor(stage / 2) : GOAL_QUESTIONS.length + stage - GOAL_QUESTIONS.length * 2 : stage;
  const select = (index: number) => selectStage(lessonAnswers ? index * 2 : index);
  const orderedTeams = [...teams].sort((a, b) => a.number - b.number);
  const question = GOAL_QUESTIONS[selected];
  return <div className="lesson-layout goal-results-layout goal-question-review">
    <aside className="sidebar">
      <p className="side-label">NỘI DUNG BÀI HỌC</p>
      <nav className="case-navigation" aria-label="Câu hỏi Hoạt động 1">
        {GOAL_QUESTIONS.map((item, index) => <Button key={`${item.member}-${index}`} variant="ghost" className={`case-button ${index === selected ? 'selected' : ''}`} aria-label={`Câu ${index + 1}`} aria-current={index === selected ? 'step' : undefined} onClick={() => select(index)}>
          <span className="case-number">{index + 1}</span><span><strong>Câu {index + 1}</strong><small>{item.member}</small></span>
        </Button>)}
      </nav>
    </aside>
    {!question ? <section aria-label="Tổng kết Hoạt động 1"><div className="goal-summary"><h3>{GOAL_SUMMARY_QUESTION}</h3><p className="correct-answer" {...reveal(selected > GOAL_QUESTIONS.length)}>{GOAL_SUMMARY_ANSWER}</p></div></section> : <section aria-label={`Kết quả câu ${selected + 1}`}>
      <div className="model-heading"><h2>Câu {selected + 1}</h2><span className="badge">{question.member}</span></div>
      <Suspense fallback={<div className="goal-viewer" />}><GoalModelViewer compact highlightedMember={question.member} questionNumber={selected + 1} /></Suspense>
      <div className="question-section goal-review-answers">
        <p className="eyebrow">QUAN SÁT & TRẢ LỜI</p>
        <h3>{question.prompt}</h3>
        {lessonAnswers && <p className="correct-answer" {...reveal(stage % 2 === 1)}>{MODEL_ANSWERS[selected]}</p>}
        <div className="goal-team-answers">
          {orderedTeams.map(team => {
            const answers = Array.isArray(team.goal_answers) ? team.goal_answers : [];
            const answer: unknown = answers[selected];
            return <div className="result-answer compact" key={team.number}><strong>Tổ {team.number}:</strong> {typeof answer === 'string' && answer.trim() ? answer.trim() : 'Chưa có câu trả lời'}</div>;
          })}
        </div>
      </div>
    </section>}
  </div>;
}
