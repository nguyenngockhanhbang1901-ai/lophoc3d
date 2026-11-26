import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BookOpen, ClipboardList, History, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  studentChangePassword,
  studentLogin,
  studentLogout,
  studentProfile,
  type StudentProfile,
} from "@/lib/exam/student.functions";
import { displayDate } from "@/lib/exam/roster";
import { passwordProblem } from "@/lib/exam/accounts";

const TOKEN_KEY = "exam-student-token";

function readToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeToken(token: string) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: the session lasts until the tab closes
  }
}

function message(e: unknown): string {
  const text = e instanceof Error ? e.message : "";
  if (text === "SESSION_EXPIRED") return "Phiên đăng nhập đã hết, hãy đăng nhập lại.";
  if (text === "ACCOUNT_LOCKED") return "Tài khoản đang bị khóa. Hãy liên hệ giáo viên.";
  return text || "Có lỗi, hãy thử lại";
}

export function StudentPortal() {
  const login = useServerFn(studentLogin);
  const logout = useServerFn(studentLogout);
  const loadProfile = useServerFn(studentProfile);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [notice, setNotice] = useState("");

  const signOut = useCallback((why = "") => {
    writeToken("");
    setToken("");
    setProfile(null);
    setNotice(why);
  }, []);

  useEffect(() => {
    const saved = readToken();
    setToken(saved);
    if (!saved) return;
    loadProfile({ data: { token: saved } })
      .then(setProfile)
      .catch((e) => signOut(message(e)));
  }, [loadProfile, signOut]);

  if (token === null || (token && !profile))
    return <p className="p-6 text-muted-foreground">Đang tải…</p>;

  if (!token || !profile) {
    return (
      <LoginForm
        notice={notice}
        onLogin={async (username, password) => {
          const r = await login({ data: { username, password } });
          writeToken(r.token);
          setToken(r.token);
          setProfile(r.profile);
          setNotice("");
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <h1 className="text-xl font-semibold">{profile.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {[
              profile.className && `Lớp ${profile.className}`,
              profile.schoolYear,
              profile.teacherName && `GV: ${profile.teacherName}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void logout({ data: { token } }).catch(() => undefined);
            signOut();
          }}
        >
          <LogOut />
          Đăng xuất
        </Button>
      </div>
      <Tabs defaultValue="assigned">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="assigned">
            <ClipboardList />
            Bài được giao
          </TabsTrigger>
          <TabsTrigger value="history">
            <History />
            Lịch sử làm bài
          </TabsTrigger>
          <TabsTrigger value="lessons">
            <BookOpen />
            Bài giảng
          </TabsTrigger>
          <TabsTrigger value="notices">
            <Bell />
            Thông báo
          </TabsTrigger>
          <TabsTrigger value="me">
            <UserRound />
            Thông tin cá nhân
          </TabsTrigger>
        </TabsList>
        <TabsContent value="assigned">
          <Empty text="Chưa có bài nào được giao. Khi giáo viên giao bài, bài sẽ hiện ở đây." />
        </TabsContent>
        <TabsContent value="history">
          <Empty text="Chưa có bài làm nào." />
        </TabsContent>
        <TabsContent value="lessons">
          <Empty text="Chưa có bài giảng nào được giao cho lớp." />
        </TabsContent>
        <TabsContent value="notices">
          <Empty text="Không có thông báo mới." />
        </TabsContent>
        <TabsContent value="me">
          <ProfileTab profile={profile} token={token} onExpired={(why) => signOut(why)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function LoginForm({
  notice,
  onLogin,
}: {
  notice: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <h1 className="mb-2 text-2xl font-semibold">Học sinh đăng nhập</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Dùng tên đăng nhập và mật khẩu giáo viên đã phát cho em.
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          onLogin(username, password)
            .catch((err) => setError(message(err)))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Tên đăng nhập
          <Input
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Mật khẩu
          <Input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {(error || notice) && (
          <p className="error-note" role="alert">
            {error || notice}
          </p>
        )}
        <Button disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Quên mật khẩu? Hãy nhờ giáo viên cấp lại mật khẩu mới.
      </p>
    </div>
  );
}

function ProfileTab({
  profile,
  token,
  onExpired,
}: {
  profile: StudentProfile;
  token: string;
  onExpired: (why: string) => void;
}) {
  const change = useServerFn(studentChangePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows: [string, string][] = [
    ["Họ và tên", profile.fullName],
    ["Ngày sinh", displayDate(profile.birthDate)],
    ["Mã học sinh", profile.studentCode ?? ""],
    ["Lớp", profile.className],
    ["Năm học", profile.schoolYear],
    ["Môn", profile.subject],
    ["Giáo viên", profile.teacherName],
    ["Tên đăng nhập", profile.username],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-semibold">Thông tin</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={k === "Tên đăng nhập" ? "font-mono" : ""}>{v}</dd>
              </div>
            ))}
        </dl>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-semibold">Đổi mật khẩu</h2>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const problem =
              passwordProblem(next) ??
              (next !== again ? "Hai lần nhập mật khẩu mới không khớp" : null);
            if (problem) {
              setStatus({ ok: false, text: problem });
              return;
            }
            setBusy(true);
            setStatus(null);
            change({ data: { token, current, next } })
              .then(() => {
                setStatus({
                  ok: true,
                  text: "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.",
                });
                setCurrent("");
                setNext("");
                setAgain("");
              })
              .catch((err) => {
                const text = message(err);
                if (
                  err instanceof Error &&
                  (err.message === "SESSION_EXPIRED" || err.message === "ACCOUNT_LOCKED")
                )
                  onExpired(text);
                else setStatus({ ok: false, text });
              })
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Mật khẩu hiện tại
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Mật khẩu mới (ít nhất 6 ký tự)
            <Input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            Nhập lại mật khẩu mới
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </label>
          {status && (
            <p className={status.ok ? "text-sm text-green-700" : "error-note"} role="status">
              {status.text}
            </p>
          )}
          <Button disabled={busy}>{busy ? "Đang đổi…" : "Đổi mật khẩu"}</Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Không bắt buộc đổi. Nếu quên mật khẩu, giáo viên sẽ cấp mật khẩu mới.
        </p>
      </div>
    </div>
  );
}
