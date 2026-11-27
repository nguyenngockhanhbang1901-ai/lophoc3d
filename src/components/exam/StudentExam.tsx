import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Maximize,
  MonitorCheck,
  RotateCcw,
  Send,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  assignmentRules,
  attemptPulse,
  attemptQuestion,
  attemptView,
  myAssignments,
  reportLeave,
  saveAnswer,
  startAttempt,
  submitAttempt,
  type AssignmentRules,
  type AttemptView,
  type DropInfo,
  type MyAssignment,
} from "@/lib/exam/attempt.functions";
import { ReviewView } from "./StudentHistory";
import {
  DROP_OUTCOME_LABEL,
  HEARTBEAT_MS,
  isMobileUserAgent,
  type ViolationKind,
} from "@/lib/exam/anticheat";
import {
  ATTEMPT_LABEL,
  WINDOW_LABEL,
  answerComplete,
  kindNumbering,
  type StudentQuestion,
} from "@/lib/exam/assignment";
import type { StudentAnswer } from "@/lib/exam/grading";
import { OPTION_LETTERS, STATEMENT_LETTERS } from "@/lib/exam/questions";
import { formatPoints } from "@/lib/exam/matrix";
import { ProtectedMath, QuestionMediaView } from "./ExamMath";

const TZ = "Asia/Ho_Chi_Minh";
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}
function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}
function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}

/** A random key for this browser tab; the server keeps a paper on the tab that started it. */
let memoryDeviceKey = "";
function examDeviceKey(): string {
  const make = () => {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  };
  try {
    let key = sessionStorage.getItem("exam-device") ?? "";
    if (!/^[0-9a-f]{32}$/.test(key)) {
      key = make();
      sessionStorage.setItem("exam-device", key);
    }
    return key;
  } catch {
    memoryDeviceKey ||= make();
    return memoryDeviceKey;
  }
}

function fullscreenSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    !!document.documentElement.requestFullscreen &&
    document.fullscreenEnabled !== false
  );
}
function enterFullscreen() {
  if (fullscreenSupported() && !document.fullscreenElement)
    void document.documentElement.requestFullscreen().catch(() => undefined);
}
/** Phones and tablets, including iPads that present themselves as a Mac. */
function onMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    isMobileUserAgent(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${s % 60} giây`;
}

/** Milliseconds to add to Date.now() to get the server's clock. */
function useServerClock(serverNow: string | undefined) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (serverNow) setOffset(new Date(serverNow).getTime() - Date.now());
  }, [serverNow]);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, []);
  return Date.now() + offset;
}

const PART: Record<string, string> = { mcq: "Phần I", tf: "Phần II", short: "Phần III" };

// ---------------------------------------------------------------- list

export function AssignedList({
  token,
  onOpen,
}: {
  token: string;
  onOpen: (assignmentId: string) => void;
}) {
  const load = useServerFn(myAssignments);
  const [rows, setRows] = useState<MyAssignment[] | null>(null);
  const [serverNow, setServerNow] = useState<string>();
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    load({ data: { token } })
      .then((r) => {
        setRows(r.assignments);
        setServerNow(r.serverNow);
      })
      .catch((e) => setError(message(e)));
  }, [load, token]);
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(t);
  }, [refresh]);
  const now = useServerClock(serverNow);
  if (error) return <p className="error-note">{error}</p>;
  if (rows === null) return <p className="p-4 text-muted-foreground">Đang tải…</p>;
  if (!rows.length)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có bài nào được giao. Khi giáo viên giao bài, bài sẽ hiện ở đây.
      </p>
    );
  return (
    <ul className="grid gap-3">
      {rows.map((a) => {
        const opensIn = new Date(a.opensAt).getTime() - now;
        const state =
          opensIn > 0 ? "scheduled" : new Date(a.closesAt).getTime() <= now ? "closed" : "open";
        return (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{a.title}</div>
              <div className="text-sm text-muted-foreground">
                {a.questionCount} câu · {a.durationMinutes} phút · mở {formatTime(a.opensAt)} · đóng{" "}
                {formatTime(a.closesAt)}
              </div>
              <div className="mt-1 text-sm">
                <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
                  {WINDOW_LABEL[state]}
                </span>
                {state === "scheduled" && <span>Mở sau {clock(opensIn)}</span>}
                {a.inProgressId && <span className="text-amber-800">Đang làm dở</span>}
                {!a.inProgressId && a.lastStatus && (
                  <span>
                    {ATTEMPT_LABEL[a.lastStatus]}
                    {a.lastScore !== null && ` · ${formatPoints(a.lastScore)}/${a.scale} điểm`}
                  </span>
                )}
                <span className="ml-2 text-muted-foreground">
                  Đã làm {a.attemptsUsed}/{a.maxAttempts} lần
                </span>
                {a.grant && !a.inProgressId && (
                  <span className="ml-2 font-medium text-green-700">
                    Được giáo viên cho làm lại
                    {a.grant.expiresAt ? ` đến ${formatTime(a.grant.expiresAt)}` : ""}
                  </span>
                )}
              </div>
            </div>
            <Button
              onClick={() => onOpen(a.id)}
              variant={
                a.inProgressId || (state !== "scheduled" && a.canStart) ? "default" : "outline"
              }
            >
              {a.inProgressId
                ? "Làm tiếp"
                : state !== "scheduled" && a.canStart
                  ? a.attemptsUsed > 0 || a.lastStatus
                    ? "Làm đề mới"
                    : "Vào làm bài"
                  : "Xem"}
              <ArrowRight />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- rules screen

export function ExamFlow({
  token,
  assignmentId,
  studentName,
  studentUsername,
  onExit,
}: {
  token: string;
  assignmentId: string;
  studentName: string;
  studentUsername: string;
  onExit: () => void;
}) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  if (attemptId)
    return (
      <ExamRunner
        key={attemptId}
        token={token}
        assignmentId={assignmentId}
        attemptId={attemptId}
        onRestart={setAttemptId}
        studentName={studentName}
        studentUsername={studentUsername}
        onExit={onExit}
      />
    );
  return (
    <RulesScreen token={token} assignmentId={assignmentId} onStart={setAttemptId} onExit={onExit} />
  );
}

function RulesScreen({
  token,
  assignmentId,
  onStart,
  onExit,
}: {
  token: string;
  assignmentId: string;
  onStart: (attemptId: string) => void;
  onExit: () => void;
}) {
  const loadRules = useServerFn(assignmentRules);
  const start = useServerFn(startAttempt);
  const [rules, setRules] = useState<AssignmentRules | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [check, setCheck] = useState<{ fullscreen: boolean; online: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    loadRules({ data: { token, assignmentId } })
      .then(setRules)
      .catch((e) => setError(message(e)));
  }, [loadRules, token, assignmentId]);
  useEffect(refresh, [refresh]);
  const now = useServerClock(rules?.serverNow);
  const opensIn = rules ? new Date(rules.opensAt).getTime() - now : 0;
  // reload when the countdown reaches the opening time
  const reloaded = useRef(false);
  useEffect(() => {
    if (rules?.state === "scheduled" && opensIn <= 0 && !reloaded.current) {
      reloaded.current = true;
      refresh();
    }
  }, [opensIn, rules?.state, refresh]);

  if (error && !rules)
    return (
      <div className="grid gap-3">
        <p className="error-note">{error}</p>
        <Button variant="outline" onClick={onExit}>
          <ArrowLeft />
          Quay lại
        </Button>
      </div>
    );
  if (!rules) return <p className="p-4 text-muted-foreground">Đang tải…</p>;
  const s = rules.settings;
  const n = s.network;
  const e = s.editRule;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const mobileBlocked = s.devices === "computer" && onMobileDevice();
  const ruleList = [
    ...(s.devices === "computer"
      ? ["Bài này chỉ được làm trên máy tính (không làm trên điện thoại, máy tính bảng)."]
      : []),
    "Phải làm bài ở chế độ toàn màn hình; thoát toàn màn hình là một lần cảnh báo.",
    `Không chuyển tab, không mở ứng dụng khác; mỗi lần là một cảnh báo. Quá ${s.maxWarnings} lần cảnh báo thì bị tự động thu bài.`,
    "Làm lần lượt từng câu, không được bỏ qua câu. Câu đã làm quay lại sửa được, câu chưa tới không xem trước được.",
    ...(e.enabled
      ? [
          `Làm xong quá nhanh (dưới ${pct(e.fastShare)} thời gian) rồi sửa đáp án trên ${pct(e.fastLimit)} số câu, hoặc sửa trên ${pct(e.slowLimit)} số câu, bị coi là gian lận: hệ thống nhắc “Bài thi có dấu hiệu gian lận” một lần, sửa tiếp thì lượt làm bị hủy và phải làm lại đề mới.`,
        ]
      : []),
    `Mất kết nối dưới ${formatPoints(n.shortMinutes)} phút được làm tiếp (tối đa ${n.freeDrops} lần). Mất quá ${formatPoints(n.shortMinutes)} phút, hoặc từ lần thứ ${n.freeDrops + 1}, thì làm lại đề mới. Mất quá ${formatPoints(n.longMinutes)} phút, hoặc quá ${n.uncountedDrops} lần, thì lượt đó tính vào số lần làm bài.`,
    `Hệ thống tự cho làm lại tối đa ${s.autoRetakes} lần. Hơn nữa, hoặc bài đã quá giờ đóng, phải chờ giáo viên cấp quyền.`,
    "Hết giờ hệ thống tự nộp bài.",
    "Không sao chép, không chụp đề; tên và mã học sinh hiện chìm trên đề.",
    "Bị thu bài do vi phạm thì chỉ được thi lại khi giáo viên cấp quyền.",
    "Mỗi lượt làm chỉ trên một thiết bị; đang làm thì không đăng nhập được ở máy khác.",
    "Toàn bộ quá trình làm bài được ghi lại để giáo viên xem.",
    s.review === "none"
      ? "Sau khi nộp, em thấy điểm; giáo viên không mở phần xem lại đáp án."
      : s.review === "after_close"
        ? "Sau khi nộp, em thấy điểm; xem lại đáp án sau khi bài đóng."
        : "Sau khi nộp, em thấy điểm và được xem lại đáp án.",
  ];
  const parts = (["mcq", "tf", "short"] as const)
    .filter((k) => rules.partCounts[k])
    .map(
      (k) =>
        `${rules.partCounts[k]} ${k === "mcq" ? "trắc nghiệm" : k === "tf" ? "đúng/sai" : "trả lời ngắn"}`,
    );
  const resume = rules.inProgressId;

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Button variant="ghost" size="sm" className="w-fit" onClick={onExit}>
        <ArrowLeft />
        Bài được giao
      </Button>
      <div className="rounded-lg border bg-card p-4">
        <h1 className="text-xl font-semibold">{rules.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rules.className && `Lớp ${rules.className} · `}
          {rules.questionCount} câu ({parts.join(", ")}) · {rules.durationMinutes} phút · mở{" "}
          {formatTime(rules.opensAt)} · đóng {formatTime(rules.closesAt)} · đã làm{" "}
          {rules.attemptsUsed}/{rules.maxAttempts} lần
        </p>
        {rules.state === "scheduled" && opensIn > 0 && (
          <div className="mt-4 rounded-md bg-amber-50 p-4 text-center">
            <div className="text-sm">Bài mở sau</div>
            <div className="font-mono text-3xl font-semibold">{clock(opensIn)}</div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold">Quy tắc làm bài</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          {ruleList.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCheck({ fullscreen: fullscreenSupported(), online: navigator.onLine })
            }
          >
            <MonitorCheck />
            Kiểm tra thiết bị
          </Button>
          {check && (
            <span className="flex flex-wrap gap-3 text-sm">
              <span className={check.fullscreen ? "text-green-700" : "text-destructive"}>
                <Maximize className="mr-1 inline" size={14} />
                {check.fullscreen ? "Toàn màn hình: được" : "Thiết bị không hỗ trợ toàn màn hình"}
              </span>
              <span className={check.online ? "text-green-700" : "text-destructive"}>
                <Wifi className="mr-1 inline" size={14} />
                {check.online ? "Có kết nối mạng" : "Không có mạng"}
              </span>
            </span>
          )}
        </div>
        {!resume && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={agreed}
              onChange={(ev) => setAgreed(ev.target.checked)}
            />
            <span>Em đã đọc và đồng ý với các quy tắc làm bài ở trên.</span>
          </label>
        )}
        {error && <p className="error-note">{error}</p>}
        {rules.blocked && !resume && (
          <p className="text-sm text-muted-foreground">{rules.blocked}.</p>
        )}
        {mobileBlocked && (
          <p className="error-note">
            Bài này chỉ làm trên máy tính. Em hãy đăng nhập bằng máy tính để làm bài.
          </p>
        )}
        <Button
          size="lg"
          disabled={
            busy || mobileBlocked || (!resume && (!agreed || !rules.canStart || opensIn > 0))
          }
          onClick={() => {
            setBusy(true);
            setError("");
            // full screen must be asked for inside the click
            enterFullscreen();
            start({ data: { token, assignmentId, acceptRules: true, device: examDeviceKey() } })
              .then((r) => onStart(r.attemptId))
              .catch((err) => {
                setError(message(err));
                refresh();
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Đang chuẩn bị đề…" : resume ? "Làm tiếp" : "Bắt đầu làm bài"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- runner

function ExamRunner({
  token,
  assignmentId,
  attemptId,
  onRestart,
  studentName,
  studentUsername,
  onExit,
}: {
  token: string;
  assignmentId: string;
  attemptId: string;
  onRestart: (attemptId: string) => void;
  studentName: string;
  studentUsername: string;
  onExit: () => void;
}) {
  const viewFn = useServerFn(attemptView);
  const questionFn = useServerFn(attemptQuestion);
  const saveFn = useServerFn(saveAnswer);
  const submitFn = useServerFn(submitAttempt);
  const pulseFn = useServerFn(attemptPulse);
  const leaveFn = useServerFn(reportLeave);
  const startFn = useServerFn(startAttempt);
  const device = useMemo(() => examDeviceKey(), []);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [dropNotice, setDropNotice] = useState<DropInfo | null>(null);
  const [editWarning, setEditWarning] = useState(false);
  const [violations, setViolations] = useState(0);
  /** the student left the exam (tab, window or full screen) and has not come back yet */
  const [away, setAway] = useState<{ kind: ViolationKind; count: number | null } | null>(null);
  /** full screen is required but not on, without it being a violation (start, after reload) */
  const [needFullscreen, setNeedFullscreen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [view, setView] = useState<AttemptView | null>(null);
  const [index, setIndex] = useState(0);
  const [questions, setQuestions] = useState<Map<number, StudentQuestion>>(new Map());
  const [answers, setAnswers] = useState<(StudentAnswer | null)[]>([]);
  const [shortDraft, setShortDraft] = useState("");
  const [reached, setReached] = useState(0);
  const [saving, setSaving] = useState(0);
  const [offline, setOffline] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    status: AttemptView["status"];
    score: number | null;
    correctCount: number | null;
  } | null>(null);
  const pending = useRef(new Map<number, StudentAnswer>());
  const submitting = useRef(false);

  const loadView = useCallback(
    (first: boolean) =>
      viewFn({ data: { token, attemptId, device } })
        .then((v) => {
          setView(v);
          setViolations(v.violationCount);
          if (v.drop) setDropNotice(v.drop);
          if (first) {
            setReached(v.reachedIndex);
            setAnswers(v.answers.length ? v.answers : v.kinds.map(() => null));
            setIndex(Math.min(v.reachedIndex, v.kinds.length - 1));
          }
          if (v.status !== "in_progress")
            setResult({ status: v.status, score: v.score, correctCount: v.correctCount });
        })
        .catch((e) => setError(message(e))),
    [viewFn, token, attemptId, device],
  );
  useEffect(() => {
    void loadView(true);
  }, [loadView]);
  /** the server closed the paper (connection rule, edit rule, violations): show why */
  const closedByServer = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    void loadView(false);
  }, [loadView]);

  const now = useServerClock(view?.serverNow);
  const left = view ? new Date(view.deadlineAt).getTime() - now : 0;
  const total = view?.kinds.length ?? 0;
  const numbers = useMemo(() => kindNumbering(view?.kinds ?? []), [view?.kinds]);
  const highCopy = view?.settings.antiCopy === "high";

  // the question on screen, and the next one as soon as it opens, each fetched once
  const requested = useRef(new Set<number>());
  useEffect(() => {
    if (!view || result) return;
    for (const i of [index, reached]) {
      if (i > reached || i >= view.kinds.length || requested.current.has(i)) continue;
      requested.current.add(i);
      questionFn({ data: { token, attemptId, index: i, device } })
        .then((q) => setQuestions((m) => new Map(m).set(i, q)))
        .catch((e) => {
          requested.current.delete(i);
          if (i === index) setError(message(e));
        });
    }
  }, [view, index, reached, questionFn, token, attemptId, result, device]);

  useEffect(() => {
    const a = answers[index];
    setShortDraft(a?.kind === "short" ? a.text : "");
  }, [index, answers]);

  const finish = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      // last answers still waiting for the network go first
      for (const [i, a] of pending.current)
        await saveFn({ data: { token, attemptId, index: i, answer: a, device } }).catch(
          () => undefined,
        );
      const r = await submitFn({ data: { token, attemptId, device } });
      if (r.status === "submitted" || r.status === "timeout") {
        setResult(r);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      } else closedByServer();
    } catch (e) {
      setError(message(e));
      submitting.current = false;
    }
  }, [saveFn, submitFn, token, attemptId, device, closedByServer]);

  // time up: hand in automatically
  useEffect(() => {
    if (view && !result && left <= 0) void finish();
  }, [left, view, result, finish]);

  const send = useCallback(
    async (i: number, a: StudentAnswer) => {
      pending.current.set(i, a);
      setSaving((n) => n + 1);
      try {
        const r = await saveFn({ data: { token, attemptId, index: i, answer: a, device } });
        if (pending.current.get(i) === a) pending.current.delete(i);
        setOffline(false);
        setOfflineSince(null);
        if (r.drop) setDropNotice(r.drop);
        if (r.status !== "in_progress") {
          pending.current.clear();
          closedByServer();
          return;
        }
        setReached((x) => Math.max(x, r.reachedIndex));
        if (r.editWarning) setEditWarning(true);
      } catch (e) {
        const text = message(e);
        if (/hết giờ|kết thúc/i.test(text)) void finish();
        else if (/thiết bị khác/i.test(text)) setError(text);
        else {
          setOffline(true);
          setOfflineSince((x) => x ?? Date.now());
          // keep it and try again shortly
          window.setTimeout(() => {
            const latest = pending.current.get(i);
            if (latest) void send(i, latest);
          }, 3000);
        }
      } finally {
        setSaving((n) => n - 1);
      }
    },
    [saveFn, token, attemptId, finish, device, closedByServer],
  );

  // heartbeat: tells the server the screen is still here; a gap is a lost connection
  const active = !!view && !result;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const beat = () => {
      pulseFn({ data: { token, attemptId, device } })
        .then((r) => {
          if (stopped) return;
          setOffline(false);
          setOfflineSince(null);
          if (r.drop) setDropNotice(r.drop);
          if (r.status !== "in_progress") closedByServer();
        })
        .catch((e) => {
          if (stopped) return;
          const text = message(e);
          if (/thiết bị khác/i.test(text)) setError(text);
          else {
            setOffline(true);
            setOfflineSince((x) => x ?? Date.now());
          }
        });
    };
    const t = window.setInterval(beat, HEARTBEAT_MS);
    const goneOffline = () => {
      setOffline(true);
      setOfflineSince((x) => x ?? Date.now());
    };
    window.addEventListener("offline", goneOffline);
    window.addEventListener("online", beat);
    return () => {
      stopped = true;
      window.clearInterval(t);
      window.removeEventListener("offline", goneOffline);
      window.removeEventListener("online", beat);
    };
  }, [active, pulseFn, token, attemptId, device, closedByServer]);

  // leaving the exam: one violation per episode, whichever events signal it
  const awayRef = useRef(false);
  const fullscreenArmed = useRef(false);
  const leave = useCallback(
    (kind: ViolationKind) => {
      if (awayRef.current) return;
      awayRef.current = true;
      setAway({ kind, count: null });
      leaveFn({ data: { token, attemptId, device, kind, awayMs: null } })
        .then((r) => {
          setViolations(r.violationCount);
          setAway((x) => (x ? { ...x, count: r.violationCount } : x));
          if (r.status !== "in_progress") closedByServer();
        })
        .catch(() => undefined);
    },
    [leaveFn, token, attemptId, device, closedByServer],
  );
  useEffect(() => {
    if (!active) return;
    const fs = fullscreenSupported();
    if (fs && !document.fullscreenElement) setNeedFullscreen(true);
    else if (fs) fullscreenArmed.current = true;
    const onVisibility = () => {
      if (document.hidden) leave("tab_hidden");
    };
    const onBlur = () => leave("window_blur");
    const onFullscreen = () => {
      if (document.fullscreenElement) {
        fullscreenArmed.current = true;
        setNeedFullscreen(false);
      } else if (fullscreenArmed.current) leave("fullscreen_exit");
      else setNeedFullscreen(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [active, leave]);
  function comeBack() {
    enterFullscreen();
    awayRef.current = false;
    setAway(null);
  }

  // no copying, saving, printing or viewing source while the paper is open
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "a", "p", "s", "u"].includes(k))
        e.preventDefault();
      if (k === "f12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)))
        e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  async function newExam() {
    setRestarting(true);
    setError("");
    enterFullscreen();
    try {
      const r = await startFn({
        data: { token, assignmentId, acceptRules: true, device: examDeviceKey() },
      });
      onRestart(r.attemptId);
    } catch (e) {
      setError(message(e));
      setRestarting(false);
    }
  }

  function answer(a: StudentAnswer) {
    setAnswers((list) => {
      const next = [...list];
      next[index] = a;
      return next;
    });
    void send(index, a);
  }

  if (error && !view)
    return (
      <div className="grid gap-3">
        <p className="error-note">{error}</p>
        <Button variant="outline" onClick={onExit}>
          Quay lại
        </Button>
      </div>
    );
  if (!view) return <p className="p-4 text-muted-foreground">Đang tải bài làm…</p>;

  if (result && result.status !== "submitted" && result.status !== "timeout")
    return (
      <ClosedScreen
        status={result.status}
        score={
          result.score === null ? null : `${formatPoints(result.score)}/${view.settings.scale}`
        }
        title={view.title}
        drop={dropNotice}
        retake={view.retake}
        restarting={restarting}
        error={error}
        onNewExam={() => void newExam()}
        onExit={onExit}
      />
    );

  if (result)
    return (
      <div className="mx-auto grid max-w-md gap-4 py-8 text-center">
        <CheckCircle2 className="mx-auto text-green-600" size={48} />
        <h1 className="text-xl font-semibold">
          {result.status === "timeout" ? "Hết giờ, bài đã được nộp" : "Em đã nộp bài"}
        </h1>
        <p className="text-muted-foreground">{view.title}</p>
        {result.score !== null && (
          <div className="rounded-lg border bg-card p-6">
            <div className="text-sm text-muted-foreground">Điểm</div>
            <div className="text-4xl font-bold">
              {formatPoints(result.score)}
              <span className="text-xl font-normal text-muted-foreground">
                /{view.settings.scale}
              </span>
            </div>
            {result.correctCount !== null && (
              <div className="mt-1 text-sm">
                Đúng hoàn toàn {result.correctCount}/{total} câu
              </div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">{ATTEMPT_LABEL[result.status]}</div>
          </div>
        )}
        {view.settings.review === "immediate" && (
          <Button variant="outline" onClick={() => setReviewing(true)}>
            Xem lại bài làm và đáp án
          </Button>
        )}
        {view.settings.review === "after_close" && (
          <p className="text-sm text-muted-foreground">
            Em xem lại đáp án được sau giờ đóng bài, trong mục Lịch sử làm bài.
          </p>
        )}
        <Button onClick={onExit}>Về trang bài được giao</Button>
        <Dialog open={reviewing} onOpenChange={setReviewing}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto text-left">
            {reviewing && <ReviewView token={token} attemptId={attemptId} />}
          </DialogContent>
        </Dialog>
      </div>
    );

  const q = questions.get(index);
  const current = answers[index] ?? null;
  const done = (i: number) => answerComplete(answers[i]);
  const canNext = index < total - 1 && index + 1 <= reached;
  const lowTime = left < 60_000;

  return (
    <div
      className="exam-sheet relative mx-auto grid max-w-4xl select-none gap-3"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <style>{"@media print { body { display: none !important; } }"}</style>
      {offline && (
        <Cover>
          <WifiOff className="mx-auto text-destructive" size={44} />
          <h2 className="text-xl font-semibold">Mất kết nối mạng</h2>
          <p>
            Đã mất {seconds(offlineSince ? Date.now() - offlineSince : 0)}. Đề được ẩn cho đến khi
            có mạng lại; câu trả lời đã chọn được lưu khi kết nối trở lại.
          </p>
          <p className="text-sm text-muted-foreground">
            Mất dưới {formatPoints(view.settings.network.shortMinutes)} phút thì được làm tiếp; lâu
            hơn sẽ phải làm đề mới.
          </p>
        </Cover>
      )}
      {!offline && away && (
        <Cover>
          <ShieldAlert className="mx-auto text-destructive" size={44} />
          <h2 className="text-xl font-semibold">Em đã rời khỏi bài thi</h2>
          <p>
            {away.kind === "fullscreen_exit"
              ? "Em đã thoát chế độ toàn màn hình."
              : away.kind === "tab_hidden"
                ? "Em đã chuyển sang tab hoặc ứng dụng khác."
                : "Em đã rời khỏi cửa sổ bài thi."}{" "}
            Đây là lần cảnh báo thứ {away.count ?? violations + 1}
            {` / ${view.settings.maxWarnings}`}. Quá {view.settings.maxWarnings} lần, bài sẽ bị thu.
          </p>
          <Button size="lg" onClick={comeBack}>
            Tiếp tục làm bài
          </Button>
        </Cover>
      )}
      {!offline && !away && needFullscreen && (
        <Cover>
          <Maximize className="mx-auto" size={44} />
          <h2 className="text-xl font-semibold">Bật toàn màn hình để làm bài</h2>
          <p className="text-sm text-muted-foreground">
            Bài thi phải làm ở chế độ toàn màn hình. Thoát toàn màn hình khi đang làm là một lần
            cảnh báo.
          </p>
          <Button size="lg" onClick={enterFullscreen}>
            <Maximize />
            Vào toàn màn hình
          </Button>
        </Cover>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-[0.07]"
      >
        <div className="flex h-full flex-wrap content-start gap-x-16 gap-y-12 p-6 text-lg font-semibold [transform:rotate(-20deg)]">
          {Array.from({ length: 40 }, (_, i) => (
            <span key={i}>
              {studentName} · {studentUsername}
            </span>
          ))}
        </div>
      </div>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{view.title}</div>
          <div className="text-xs text-muted-foreground">
            {studentName} · đã làm {answers.filter((a) => answerComplete(a)).length}/{total} câu
            {saving > 0 && " · đang lưu…"}
            {violations > 0 && (
              <span className="text-destructive">
                {" "}
                · cảnh báo {violations}/{view.settings.maxWarnings}
              </span>
            )}
            {offline && <span className="text-destructive"> · mất kết nối, đang thử lưu lại</span>}
          </div>
        </div>
        <div
          className={`flex items-center gap-1 rounded-md px-3 py-1 font-mono text-xl font-semibold ${lowTime ? "bg-red-100 text-red-800" : "bg-muted"}`}
          aria-live="polite"
        >
          <Clock size={18} />
          {clock(left)}
        </div>
      </header>

      <nav aria-label="Các câu" className="flex flex-wrap gap-1">
        {view.kinds.map((k, i) => {
          const locked = i > reached;
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => setIndex(i)}
              title={`${PART[k]} · câu ${numbers[i]}${locked ? " (chưa mở)" : ""}`}
              className={`h-9 w-9 rounded-md border text-sm ${i === index ? "border-primary bg-primary text-primary-foreground" : done(i) ? "bg-green-100 text-green-900" : locked ? "cursor-not-allowed bg-muted text-muted-foreground opacity-50" : "bg-background"}`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <article className="relative rounded-lg border bg-card p-4">
        <div className="mb-2 text-sm font-semibold">
          {PART[view.kinds[index] ?? "mcq"]} · Câu {numbers[index]}{" "}
          <span className="font-normal text-muted-foreground">
            ({formatPoints(view.points[index] ?? 0)} điểm)
          </span>
        </div>
        {!q ? (
          <p className="text-muted-foreground">Đang tải câu hỏi…</p>
        ) : (
          <div className="grid gap-3">
            <ProtectedMath text={q.stem} protect={highCopy} />
            <QuestionMediaView media={q.media} />
            {q.kind === "mcq" && (
              <div className="grid gap-2" role="radiogroup">
                {q.options.map((o, i) => {
                  const chosen = current?.kind === "mcq" && current.choice === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      onClick={() => answer({ kind: "mcq", choice: i })}
                      className={`flex items-start gap-2 rounded-md border p-2 text-left ${chosen ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${chosen ? "border-primary bg-primary text-primary-foreground" : ""}`}
                      >
                        {OPTION_LETTERS[i]}
                      </span>
                      <ProtectedMath text={o} protect={highCopy} className="min-w-0 flex-1" />
                    </button>
                  );
                })}
              </div>
            )}
            {q.kind === "tf" && (
              <div className="grid gap-2">
                {q.statements.map((st, i) => {
                  const choices =
                    current?.kind === "tf" ? current.choices : [null, null, null, null];
                  return (
                    <div key={i} className="flex flex-wrap items-start gap-2 rounded-md border p-2">
                      <span className="font-semibold">{STATEMENT_LETTERS[i]})</span>
                      <ProtectedMath text={st} protect={highCopy} className="min-w-0 flex-1" />
                      <div className="flex gap-1">
                        {[true, false].map((v) => (
                          <button
                            key={String(v)}
                            type="button"
                            aria-pressed={choices[i] === v}
                            onClick={() => {
                              const next = [...choices];
                              next[i] = v;
                              answer({ kind: "tf", choices: next });
                            }}
                            className={`rounded-md border px-3 py-1 text-sm ${choices[i] === v ? (v ? "border-green-600 bg-green-600 text-white" : "border-red-600 bg-red-600 text-white") : "hover:bg-muted"}`}
                          >
                            {v ? "Đúng" : "Sai"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">Chọn Đúng hoặc Sai cho cả bốn ý.</p>
              </div>
            )}
            {q.kind === "short" && (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (shortDraft.trim()) answer({ kind: "short", text: shortDraft.trim() });
                }}
              >
                <Input
                  className="w-48 font-mono text-lg"
                  inputMode="decimal"
                  maxLength={50}
                  placeholder="Nhập đáp án"
                  value={shortDraft}
                  onChange={(e) => setShortDraft(e.target.value)}
                />
                <Button
                  type="submit"
                  variant={
                    current?.kind === "short" &&
                    current.text === shortDraft.trim() &&
                    shortDraft.trim()
                      ? "outline"
                      : "default"
                  }
                >
                  {current?.kind === "short" &&
                  current.text === shortDraft.trim() &&
                  shortDraft.trim()
                    ? "Đã xác nhận"
                    : "Xác nhận"}
                </Button>
                <span className="w-full text-xs text-muted-foreground">
                  Số thập phân dùng dấu phẩy hoặc dấu chấm đều được; không dùng dấu ngăn cách hàng
                  nghìn.
                </span>
              </form>
            )}
          </div>
        )}
      </article>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ArrowLeft />
          Câu trước
        </Button>
        {index < total - 1 ? (
          <Button
            disabled={!canNext}
            onClick={() => setIndex(index + 1)}
            title={canNext ? "" : "Trả lời câu này để sang câu tiếp"}
          >
            Câu tiếp
            <ArrowRight />
          </Button>
        ) : (
          <Button disabled={!done(index)} onClick={() => setConfirmSubmit(true)}>
            <Send />
            Nộp bài
          </Button>
        )}
      </div>
      {error && <p className="error-note">{error}</p>}

      <Dialog open={editWarning} onOpenChange={setEditWarning}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert />
            Bài thi có dấu hiệu gian lận
          </DialogTitle>
          <DialogDescription>
            Em đã sửa đáp án của nhiều câu sau khi làm xong. Nếu tiếp tục sửa, lượt làm này sẽ bị
            hủy và em phải làm lại một đề mới từ đầu.
          </DialogDescription>
          <div className="flex justify-end">
            <Button onClick={() => setEditWarning(false)}>Tôi đã hiểu</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!dropNotice && dropNotice.outcome === "continue"}
        onOpenChange={(o) => !o && setDropNotice(null)}
      >
        <DialogContent>
          <DialogTitle className="flex items-center gap-2">
            <Wifi />
            Đã kết nối lại
          </DialogTitle>
          <DialogDescription>
            {dropNotice &&
              `Em bị mất kết nối ${seconds(dropNotice.durationMs)} (lần thứ ${dropNotice.dropNumber}). Em được làm tiếp bài; thời gian làm bài vẫn chạy trong lúc mất mạng.`}
          </DialogDescription>
          <div className="flex justify-end">
            <Button onClick={() => setDropNotice(null)}>Làm tiếp</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent>
          <DialogTitle>Nộp bài?</DialogTitle>
          <DialogDescription>
            Em đã làm {answers.filter((a) => answerComplete(a)).length}/{total} câu, còn{" "}
            {clock(left)}. Sau khi nộp không sửa được nữa.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmSubmit(false)}>
              Làm tiếp
            </Button>
            <Button
              onClick={() => {
                setConfirmSubmit(false);
                void finish();
              }}
            >
              Nộp bài
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cover({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alertdialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4"
    >
      <div className="grid max-w-md gap-3 rounded-lg border bg-card p-6 text-center shadow-lg">
        {children}
      </div>
    </div>
  );
}

const CLOSED_TITLE: Partial<Record<AttemptView["status"], string>> = {
  violation: "Bài đã bị thu do vi phạm",
  cancelled_network: "Lượt làm bị hủy do mất kết nối",
  cancelled_edit: "Lượt làm bị hủy do sửa đáp án",
};

function ClosedScreen({
  status,
  score,
  title,
  drop,
  retake,
  restarting,
  error,
  onNewExam,
  onExit,
}: {
  status: AttemptView["status"];
  score: string | null;
  title: string;
  drop: DropInfo | null;
  retake: AttemptView["retake"];
  restarting: boolean;
  error: string;
  onNewExam: () => void;
  onExit: () => void;
}) {
  return (
    <div className="mx-auto grid max-w-md gap-4 py-8 text-center">
      <ShieldAlert className="mx-auto text-destructive" size={48} />
      <h1 className="text-xl font-semibold">{CLOSED_TITLE[status] ?? "Bài làm đã kết thúc"}</h1>
      <p className="text-muted-foreground">{title}</p>
      <div className="rounded-lg border bg-card p-4 text-sm">
        {status === "cancelled_network" && drop && (
          <p>
            Em mất kết nối {seconds(drop.durationMs)} (lần thứ {drop.dropNumber}):{" "}
            {DROP_OUTCOME_LABEL[drop.outcome].toLowerCase()}.
          </p>
        )}
        {status === "cancelled_network" && !drop && (
          <p>Em mất kết nối quá lâu hoặc quá nhiều lần.</p>
        )}
        {status === "cancelled_edit" && (
          <p>
            Em đã sửa đáp án quá nhiều câu sau khi làm xong. Lượt này bị hủy và tính vào số lần làm.
          </p>
        )}
        {status === "violation" && (
          <p>
            Em đã rời khỏi bài thi quá số lần cho phép. Bài đã được thu và chấm điểm
            {score && `: ${score} điểm`}.
          </p>
        )}
        {retake?.allowed ? (
          <p className="mt-2 font-medium">Em được làm lại một đề mới, đủ thời gian làm bài.</p>
        ) : (
          retake?.reason && <p className="mt-2 font-medium">{retake.reason}.</p>
        )}
      </div>
      {error && <p className="error-note">{error}</p>}
      {retake?.allowed && (
        <Button size="lg" disabled={restarting} onClick={onNewExam}>
          <RotateCcw />
          {restarting ? "Đang chuẩn bị đề…" : "Làm đề mới"}
        </Button>
      )}
      <Button variant="outline" onClick={onExit}>
        Về trang bài được giao
      </Button>
    </div>
  );
}
