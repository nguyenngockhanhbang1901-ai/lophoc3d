import { FIGURE_VIEWBOX, QUIZ_FIGURES, type QuizFigureKey } from '@/lib/quiz-figures';

/** Static textbook-style drawing: solid visible edges, dashed hidden ones, italic point names. */
export function QuizFigure({ figure }: { figure: QuizFigureKey }) {
  const f = QUIZ_FIGURES[figure];
  const p = (name: string) => f.points[name]!;
  return <figure className="quiz-figure">
    <svg viewBox={`0 0 ${FIGURE_VIEWBOX.width} ${FIGURE_VIEWBOX.height}`} role="img" aria-label={f.title}>
      {f.segments.map(s => { const a = p(s.from), b = p(s.to); return <line key={`${s.from}${s.to}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={s.hidden ? 'quiz-figure-hidden' : 'quiz-figure-edge'} />; })}
      {f.dots.map(n => <circle key={n} cx={p(n)[0]} cy={p(n)[1]} r={3.5} className="quiz-figure-dot" />)}
      {Object.entries(f.labels).map(([n, [dx, dy]]) => <text key={n} x={p(n)[0] + dx} y={p(n)[1] + dy} className="quiz-figure-label">{n}</text>)}
    </svg>
  </figure>;
}
