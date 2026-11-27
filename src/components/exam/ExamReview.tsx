// One question looked back at: what the student chose next to the key, with points and the
// worked solution. Shared by the teacher's attempt detail and the student's review.
import { Check, X } from "lucide-react";
import { formatPoints } from "@/lib/exam/matrix";
import { OPTION_LETTERS, STATEMENT_LETTERS } from "@/lib/exam/questions";
import type { ReviewQuestion } from "@/lib/exam/review";
import { ExamMath, QuestionMediaView } from "./ExamMath";

export function ReviewQuestionCard({
  label,
  q,
  showSolution = true,
}: {
  label: string;
  q: ReviewQuestion;
  showSolution?: boolean;
}) {
  const verdict =
    q.share >= 1 ? "text-green-700" : q.share > 0 ? "text-amber-700" : "text-destructive";
  return (
    <article className="grid gap-2 rounded-lg border bg-card p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{label}</h3>
        <span className={`text-sm font-medium ${verdict}`}>
          {formatPoints(Math.round(q.earned * 1000) / 1000)}/{formatPoints(q.points)} điểm
        </span>
      </header>
      <ExamMath text={q.stem} />
      <QuestionMediaView media={q.media} />
      {q.correct.kind === "mcq" && (
        <ol className="grid gap-1">
          {q.options.map((o, i) => {
            const chosen = q.answer?.kind === "mcq" && q.answer.choice === i;
            const right = q.correct.kind === "mcq" && q.correct.choice === i;
            return (
              <li
                key={i}
                className={`flex items-start gap-2 rounded px-2 py-1 ${
                  right ? "bg-green-100 text-green-900" : chosen ? "bg-red-100 text-red-900" : ""
                }`}
              >
                <span className="font-semibold">{OPTION_LETTERS[i]}.</span>
                <ExamMath text={o} className="flex-1" />
                {chosen && <span className="text-xs font-semibold">Em chọn</span>}
                {right && <Check size={16} aria-label="Đáp án đúng" />}
              </li>
            );
          })}
        </ol>
      )}
      {q.correct.kind === "tf" && (
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="p-1" />
              <th className="p-1">Mệnh đề</th>
              <th className="p-1">Em chọn</th>
              <th className="p-1">Đáp án</th>
            </tr>
          </thead>
          <tbody>
            {q.statements.map((st, i) => {
              const mine = q.answer?.kind === "tf" ? q.answer.choices[i] : null;
              const key = q.correct.kind === "tf" ? q.correct.values[i] : null;
              const ok = mine !== null && mine !== undefined && mine === key;
              return (
                <tr key={i} className="border-t align-top">
                  <td className="p-1 font-semibold">{STATEMENT_LETTERS[i]})</td>
                  <td className="p-1">
                    <ExamMath text={st} />
                  </td>
                  <td className={`p-1 font-medium ${ok ? "text-green-700" : "text-destructive"}`}>
                    {mine === null || mine === undefined ? "—" : mine ? "Đúng" : "Sai"}
                    {ok ? (
                      <Check size={14} className="ml-1 inline" />
                    ) : (
                      <X size={14} className="ml-1 inline" />
                    )}
                  </td>
                  <td className="p-1">
                    {key === null || key === undefined ? "—" : key ? "Đúng" : "Sai"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {q.correct.kind === "short" && (
        <p className="text-sm">
          <span className="text-muted-foreground">Em trả lời: </span>
          <span className="font-mono font-semibold">
            {q.answer?.kind === "short" && q.answer.text ? q.answer.text : "—"}
          </span>
          <span className="ml-3 text-muted-foreground">Đáp án: </span>
          <span className="font-mono font-semibold text-green-800">
            {q.correct.answers.filter((a) => a.trim()).join(" hoặc ") || "—"}
          </span>
        </p>
      )}
      {showSolution && q.explanation.trim() && (
        <div className="rounded border-l-4 border-primary/40 bg-muted/50 p-2 text-sm">
          <div className="mb-1 font-medium">Lời giải</div>
          <ExamMath text={q.explanation} />
        </div>
      )}
    </article>
  );
}
