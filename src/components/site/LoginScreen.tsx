import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Box,
  CircleCheck,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  LogIn,
  Mail,
  Plus,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AuthorCredit, HeroArt, SiteLogo } from "./brand";
import { TAB_ALIVE_KEY, TEMP_SESSION_KEY } from "@/lib/session-keys";

export type LoginRole = "student" | "teacher";
type TeacherMode = "login" | "signup" | "forgot";

function friendly(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e ?? "");
  if (/invalid login credentials/i.test(text)) return "Email hoặc mật khẩu chưa đúng.";
  if (/email not confirmed/i.test(text))
    return "Email chưa được xác nhận. Hãy mở hộp thư và bấm liên kết xác nhận.";
  if (/already registered/i.test(text)) return "Email này đã có tài khoản, hãy đăng nhập.";
  if (/password should be at least/i.test(text)) return "Mật khẩu cần ít nhất 8 ký tự.";
  if (text === "SESSION_EXPIRED") return "Phiên đăng nhập đã hết, hãy đăng nhập lại.";
  if (text === "ACCOUNT_LOCKED") return "Tài khoản đang bị khóa. Hãy liên hệ giáo viên.";
  return text || "Không đăng nhập được. Vui lòng thử lại.";
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="icon-input">
      <LockKeyhole />
      <Input
        type={shown ? "text" : "password"}
        required
        minLength={minLength}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="eye"
        aria-label={shown ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        onClick={() => setShown(!shown)}
      >
        {shown ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  );
}

/** Lớp Học Số sign-in page with Học sinh / Giáo viên tabs. */
export function LoginScreen({
  initialRole = "teacher",
  notice = "",
  onStudentLogin,
}: {
  initialRole?: LoginRole;
  notice?: string;
  onStudentLogin: (username: string, password: string) => Promise<void>;
}) {
  const [role, setRole] = useState<LoginRole>(initialRole);
  const [help, setHelp] = useState(false);
  return (
    <div className="site-page relative flex min-h-screen flex-col overflow-hidden">
      <div className="bg-blob -right-40 -top-40 h-[520px] w-[520px]" />
      <div className="bg-blob -bottom-56 -left-40 h-[520px] w-[520px] opacity-70" />
      <div className="bg-blob -bottom-60 right-10 h-[380px] w-[380px] opacity-60" />
      <header className="relative z-10 px-6 pt-5 md:px-10">
        <SiteLogo />
      </header>
      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-6 py-8 md:px-10 lg:grid-cols-[1fr_400px_1fr]">
        <section className="hidden lg:block">
          <h1 className="site-title text-[32px] leading-tight">
            Học tập thông minh
            <br />
            <span className="text-[color:var(--site-blue)]">Khám phá vô hạn</span>
          </h1>
          <svg width="190" height="10" viewBox="0 0 190 10" className="mt-2" aria-hidden>
            <path
              d="M2 7 Q95 1 188 6"
              stroke="var(--site-blue)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <p className="mt-5 max-w-xs text-sm text-muted-foreground">
            Cùng Lớp Học Số khám phá tri thức, chinh phục tương lai!
          </p>
          <ul className="mt-6 grid gap-3 text-[13px] font-medium text-[color:var(--site-navy)]">
            {[
              { icon: BookOpen, text: "Bài giảng tương tác", tone: "text-blue-600" },
              { icon: Box, text: "Mô hình 3D trực quan", tone: "text-violet-600" },
              { icon: CircleCheck, text: "Làm bài thông minh", tone: "text-emerald-600" },
            ].map(({ icon: Icon, text, tone }) => (
              <li key={text} className="flex items-center gap-3">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full border bg-card ${tone}`}
                >
                  <Icon size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>

        <section className="site-card mx-auto w-full max-w-[400px] p-7">
          <h2 className="site-title text-center text-2xl">Đăng nhập</h2>
          <p className="mb-5 mt-1 text-center text-xs text-muted-foreground">
            {role === "student"
              ? "Bắt đầu hành trình học tập của bạn"
              : "Quản lý lớp học, bài giảng và đề thi"}
          </p>
          <div className="login-tabs mb-5" role="tablist" aria-label="Vai trò">
            <button
              type="button"
              role="tab"
              aria-selected={role === "student"}
              onClick={() => setRole("student")}
            >
              <GraduationCap size={15} />
              Học sinh
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={role === "teacher"}
              onClick={() => setRole("teacher")}
            >
              <UserRound size={15} />
              Giáo viên
            </button>
          </div>
          {role === "student" ? (
            <StudentForm notice={notice} onLogin={onStudentLogin} />
          ) : (
            <TeacherForm />
          )}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Cần hỗ trợ?{" "}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => setHelp(true)}
            >
              Xem hướng dẫn
            </button>
          </p>
        </section>

        <section className="hidden lg:block">
          <HeroArt variant="login" />
        </section>
      </main>
      <footer className="relative z-10 flex justify-end px-6 pb-4 md:px-10">
        <AuthorCredit />
      </footer>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Hướng dẫn đăng nhập</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-3 text-sm">
              <p>
                <b>Học sinh làm bài thi online:</b> chọn thẻ <i>Học sinh</i>, nhập tên đăng nhập và
                mật khẩu thầy cô đã phát. Quên mật khẩu thì hỏi giáo viên.
              </p>
              <p>
                <b>Học sinh vào tiết học trên lớp:</b> bấm <i>Vào lớp bằng mã lớp</i> rồi nhập mã
                thầy cô chiếu trên màn hình chung, không cần tài khoản.
              </p>
              <p>
                <b>Giáo viên:</b> chọn thẻ <i>Giáo viên</i>, đăng nhập bằng email đã đăng ký hoặc
                bấm <i>Tiếp tục với Google</i>. Chưa có tài khoản thì bấm{" "}
                <i>Đăng ký tài khoản giáo viên</i>.
              </p>
            </div>
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentForm({
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
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        onLogin(username, password)
          .catch((err) => setError(friendly(err)))
          .finally(() => setBusy(false));
      }}
    >
      <div className="icon-input">
        <UserRound />
        <Input
          required
          placeholder="Nhập mã học sinh hoặc tài khoản"
          aria-label="Tên đăng nhập"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <PasswordInput
        value={password}
        onChange={setPassword}
        placeholder="Nhập mật khẩu"
        autoComplete="current-password"
      />
      {(error || notice) && (
        <p className="error-note" role="alert">
          {error || notice}
        </p>
      )}
      <Button disabled={busy} className="h-11 rounded-[10px] text-sm font-semibold">
        <LogIn />
        {busy ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
      <p className="divider-or">Hoặc</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 rounded-[10px] font-semibold"
        onClick={() => {
          window.location.href = "/?vao=ma-lop";
        }}
      >
        <KeyRound className="text-amber-500" />
        Vào lớp bằng mã lớp
      </Button>
    </form>
  );
}

function TeacherForm() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<TeacherMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function keepSession() {
    try {
      if (remember) window.localStorage.removeItem(TEMP_SESSION_KEY);
      else {
        window.localStorage.setItem(TEMP_SESSION_KEY, "1");
        window.sessionStorage.setItem(TAB_ALIVE_KEY, "1");
      }
    } catch {
      // storage unavailable: the session simply stays
    }
  }

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage({ ok: true, text: "Đã gửi email. Hãy mở hộp thư để đặt lại mật khẩu." });
      } else if (mode === "signup") {
        if (password !== again) throw new Error("Hai lần nhập mật khẩu không khớp.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() } },
        });
        if (error) throw error;
        if (data.session) {
          keepSession();
          await navigate({ to: "/" });
          return;
        }
        setMessage({
          ok: true,
          text: "Đã tạo tài khoản. Hãy mở email và bấm liên kết xác nhận, sau đó đăng nhập.",
        });
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        keepSession();
        await navigate({ to: "/" });
      }
    } catch (e) {
      setMessage({ ok: false, text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setMessage(null);
    keepSession();
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) {
      setMessage({ ok: false, text: friendly(r.error) });
      return;
    }
    if (r.redirected) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setMessage({ ok: false, text: "Không đăng nhập được. Vui lòng thử lại." });
      return;
    }
    await navigate({ to: "/" });
  }

  return (
    <div className="grid gap-3">
      {mode !== "login" && (
        <button
          type="button"
          className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMode("login");
            setMessage(null);
          }}
        >
          <ArrowLeft size={14} />
          Quay lại đăng nhập
        </button>
      )}
      {mode !== "login" && (
        <p className="text-sm font-semibold text-[color:var(--site-navy)]">
          {mode === "signup" ? "Đăng ký tài khoản giáo viên" : "Quên mật khẩu"}
        </p>
      )}
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === "signup" && (
          <div className="icon-input">
            <UserRound />
            <Input
              required
              minLength={2}
              placeholder="Họ và tên giáo viên"
              aria-label="Họ và tên"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div className="icon-input">
          <Mail />
          <Input
            type="email"
            required
            placeholder="Nhập email giáo viên"
            aria-label="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {mode !== "forgot" && (
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder={mode === "signup" ? "Tạo mật khẩu (ít nhất 8 ký tự)" : "Nhập mật khẩu"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
          />
        )}
        {mode === "signup" && (
          <PasswordInput
            value={again}
            onChange={setAgain}
            placeholder="Nhập lại mật khẩu"
            autoComplete="new-password"
            minLength={8}
          />
        )}
        {mode === "login" && (
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Ghi nhớ đăng nhập
            </label>
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => {
                setMode("forgot");
                setMessage(null);
              }}
            >
              Quên mật khẩu?
            </button>
          </div>
        )}
        {message && (
          <p
            className={message.ok ? "text-sm text-emerald-700" : "error-note"}
            role={message.ok ? "status" : "alert"}
          >
            {message.text}
          </p>
        )}
        <Button disabled={busy} className="h-11 rounded-[10px] text-sm font-semibold">
          {mode === "signup" ? <Plus /> : mode === "forgot" ? <Mail /> : <LogIn />}
          {busy
            ? "Đang xử lý…"
            : mode === "signup"
              ? "Tạo tài khoản"
              : mode === "forgot"
                ? "Gửi email khôi phục"
                : "Đăng nhập"}
        </Button>
      </form>
      {mode !== "forgot" && (
        <>
          <p className="divider-or">Hoặc</p>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-[10px] font-semibold"
            onClick={() => {
              void google();
            }}
          >
            <GoogleIcon />
            {mode === "signup" ? "Đăng ký bằng Google" : "Tiếp tục với Google"}
          </Button>
          {mode === "login" && (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[10px] font-semibold"
              onClick={() => {
                setMode("signup");
                setMessage(null);
              }}
            >
              <Plus />
              Đăng ký tài khoản giáo viên
            </Button>
          )}
        </>
      )}
    </div>
  );
}
