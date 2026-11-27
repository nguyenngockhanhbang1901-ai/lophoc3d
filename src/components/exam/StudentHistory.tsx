// The student's own attempts, and looking back at one when the teacher allows it.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { myHistory, reviewAttempt } from "@/lib/exam/attempt.functions";
import { ATTEMPT_LABEL } from "@/lib/exam/assignment";
import { formatPoints } from "@/lib/exam/matrix";
import type { HistoryEntry } from "@/lib/exam/review.server";
import type { ReviewQuestion } from "@/lib/exam/review";
import { ReviewQuestionCard } from "./ExamReview";

const TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const time = (iso: string | null) => (iso ? TIME.format(new Date(iso)) : "—");

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

export function HistoryList({ token }: { token: string }) {
  const load = useServerFn(myHistory);
  const [list, setList] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<HistoryEntry | null>(null);
  useEffect(() => {
    load({ data: { token } })
      .then((r) => setList(r.history))
      .catch((e) => setError(message(e)));
  }, [load, token]);
  if (error) return <p className="error-note">{error}</p>;
  if (!list) return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  if (!list.length)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có bài làm nào.
      </p>
    );
  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Bài</th>
              <th className="p-2">Lượt</th>
              <th className="p-2">Bắt đầu</th>
              <th className="p-2">Kết thúc</th>
              <th className="p-2">Trạng thái</th>
              <th className="p-2">Điểm</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.attemptId} className="border-b last:border-0">
                <td className="p-2 font-medium">{h.title}</td>
                <td className="p-2">{h.attemptNo}</td>
                <td className="p-2 whitespace-nowrap">{time(h.startedAt)}</td>
                <td className="p-2 whitespace-nowrap">{time(h.finishedAt)}</td>
                <td className="p-2">{ATTEMPT_LABEL[h.status]}</td>
                <td className="p-2 font-semibold">
                  {h.score === null ? "" : `${formatPoints(h.score)}/${h.scale}`}
                </td>
                <td className="p-2">
                  {h.canReview ? (
                    <Button size="sm" variant="outline" onClick={() => setOpen(h)}>
                      <Eye />
                      Xem lại
                    </Button>
                  ) : h.reviewFrom ? (
                    <span className="text-xs text-muted-foreground">
                      Xem lại sau {time(h.reviewFrom)}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {open && <ReviewView token={token} attemptId={open.attemptId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReviewView({ token, attemptId }: { token: string; attemptId: string }) {
  const load = useServerFn(reviewAttempt);
  const [data, setData] = useState<{
    title: string;
    score: number | null;
    scale: number;
    labels: string[];
    questions: ReviewQuestion[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    load({ data: { token, attemptId } })
      .then(setData)
      .catch((e) => setError(message(e)));
  }, [load, token, attemptId]);
  return (
    <div className="grid gap-3">
      <DialogTitle>{data?.title ?? "Xem lại bài làm"}</DialogTitle>
      <DialogDescription>
        {data?.score !== null && data?.score !== undefined
          ? `Điểm: ${formatPoints(data.score)}/${data.scale}`
          : "Đáp án và lời giải từng câu."}
      </DialogDescription>
      {error && <p className="error-note">{error}</p>}
      {!data && !error && <p>Đang tải…</p>}
      {data?.questions.map((q, i) => (
        <ReviewQuestionCard key={i} label={data.labels[i] ?? `Câu ${i + 1}`} q={q} />
      ))}
    </div>
  );
}
