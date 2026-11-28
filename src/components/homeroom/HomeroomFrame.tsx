// Shared frame for every homeroom page: teacher sign-in gate, homeroom class picker
// (remembered in this browser) and the first-time "chọn lớp chủ nhiệm" setup.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTeacher } from "@/components/slides/use-teacher";
import { TeacherShell, type TeacherNavKey } from "@/components/site/TeacherShell";
import {
  listHomeroomClasses,
  saveHomeroomSettings,
  type HomeroomClass,
  type HomeroomSettings,
} from "@/lib/homeroom/homeroom.functions";
import { defaultTerms, vnToday } from "@/lib/homeroom/periods";

const PICK_KEY = "lhs-chu-nhiem-lop";

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

function remembered(): string {
  try {
    return localStorage.getItem(PICK_KEY) ?? "";
  } catch {
    return "";
  }
}
function remember(id: string) {
  try {
    localStorage.setItem(PICK_KEY, id);
  } catch {
    /* private mode */
  }
}

export interface HomeroomContext {
  cls: HomeroomClass & { settings: HomeroomSettings };
  reloadClasses: () => Promise<void>;
  openSettings: () => void;
}

export function HomeroomFrame({
  current,
  title,
  children,
}: {
  current: TeacherNavKey;
  title: string;
  children: (ctx: HomeroomContext) => ReactNode;
}) {
  const user = useTeacher();
  return (
    <TeacherShell current={current} title={title}>
      {user === undefined ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : user === null ? (
        <div className="mx-auto max-w-sm py-10 text-center">
          <p className="mb-4">Đăng nhập tài khoản giáo viên để quản lý lớp chủ nhiệm.</p>
          <Button asChild>
            <Link to="/auth">
              <GraduationCap />
              Đăng nhập giáo viên
            </Link>
          </Button>
        </div>
      ) : (
        <ClassGate>{children}</ClassGate>
      )}
    </TeacherShell>
  );
}

function ClassGate({ children }: { children: (ctx: HomeroomContext) => ReactNode }) {
  const list = useServerFn(listHomeroomClasses);
  const [classes, setClasses] = useState<HomeroomClass[] | null>(null);
  const [classId, setClassId] = useState("");
  const [error, setError] = useState("");
  const [setup, setSetup] = useState<HomeroomClass | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await list();
      setClasses(all);
      setError("");
      setClassId((id) => {
        const homeroom = all.filter((c) => c.settings);
        const want = id || remembered();
        return homeroom.some((c) => c.id === want) ? want : (homeroom[0]?.id ?? "");
      });
    } catch (e) {
      setClasses([]);
      setError(errorText(e));
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  if (classes === null) return <p className="text-muted-foreground">Đang tải lớp chủ nhiệm…</p>;
  if (error)
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive">
        {error}
      </p>
    );

  const homeroom = classes.filter((c) => c.settings);
  const cls = homeroom.find((c) => c.id === classId);
  const others = classes.filter((c) => !c.settings);

  const dialog = setup ? (
    <SettingsDialog
      cls={setup}
      onClose={() => setSetup(null)}
      onSaved={async (id) => {
        setSetup(null);
        if (id) {
          remember(id);
          setClassId(id);
        }
        await load();
      }}
    />
  ) : null;

  if (!cls)
    return (
      <div className="site-card mx-auto max-w-xl p-6">
        <h2 className="site-section-title mb-2">Chọn lớp chủ nhiệm</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Lớp chủ nhiệm dùng chung danh sách học sinh với trang{" "}
          <Link to="/lop-thi" className="text-primary underline">
            Tài khoản học sinh
          </Link>
          . Hãy chọn lớp mình chủ nhiệm (hoặc tạo lớp ở trang đó trước).
        </p>
        {others.length ? (
          <div className="grid gap-2">
            {others.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted"
                onClick={() => setSetup(c)}
              >
                <span>
                  <b>{c.name}</b>
                  {c.schoolYear ? (
                    <span className="text-muted-foreground"> · {c.schoolYear}</span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">{c.studentCount} học sinh</span>
              </button>
            ))}
          </div>
        ) : (
          <Button asChild>
            <Link to="/lop-thi">Tạo lớp và nhập danh sách học sinh</Link>
          </Button>
        )}
        {dialog}
      </div>
    );

  const ctx: HomeroomContext = {
    cls: cls as HomeroomContext["cls"],
    reloadClasses: load,
    openSettings: () => setSetup(cls),
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Lớp chủ nhiệm:</span>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm font-semibold"
          value={cls.id}
          onChange={(e) => {
            if (e.target.value === "__add") {
              const first = others[0];
              if (first) setSetup(first);
              return;
            }
            remember(e.target.value);
            setClassId(e.target.value);
          }}
          aria-label="Chọn lớp chủ nhiệm"
        >
          {homeroom.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.schoolYear ? ` · ${c.schoolYear}` : ""}
            </option>
          ))}
          {others.length ? <option value="__add">+ Thêm lớp chủ nhiệm khác…</option> : null}
        </select>
        <Button variant="ghost" size="sm" onClick={() => setSetup(cls)}>
          <Settings2 />
          Cài đặt lớp
        </Button>
      </div>
      {children(ctx)}
      {dialog}
    </div>
  );
}

function SettingsDialog({
  cls,
  onClose,
  onSaved,
}: {
  cls: HomeroomClass;
  onClose: () => void;
  onSaved: (classId: string | null) => Promise<void>;
}) {
  const save = useServerFn(saveHomeroomSettings);
  const base = defaultTerms(vnToday());
  const s = cls.settings;
  const [yearStart, setYearStart] = useState(s?.yearStart ?? base.yearStart);
  const [term2Start, setTerm2Start] = useState(s?.term2Start ?? base.term2Start);
  const [yearEnd, setYearEnd] = useState(s?.yearEnd ?? base.yearEnd);
  const [twoSessions, setTwoSessions] = useState(s?.twoSessions ?? false);
  const [consecutive, setConsecutive] = useState(s?.alertConsecutive ?? 3);
  const [unexcused, setUnexcused] = useState(s?.alertUnexcusedMonth ?? 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(homeroom: boolean) {
    setBusy(true);
    setError("");
    try {
      await save({
        data: {
          classId: cls.id,
          homeroom,
          yearStart: yearStart || null,
          term2Start: term2Start || null,
          yearEnd: yearEnd || null,
          twoSessions,
          alertConsecutive: consecutive,
          alertUnexcusedMonth: unexcused,
        },
      });
      await onSaved(homeroom ? cls.id : null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          {s ? "Cài đặt lớp chủ nhiệm" : "Đặt làm lớp chủ nhiệm"} · {cls.name}
        </DialogTitle>
        <DialogDescription>
          Ngày học kỳ dùng cho thống kê theo học kỳ. Ngưỡng cảnh báo có thể đổi bất cứ lúc nào.
        </DialogDescription>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="ys">Khai giảng</Label>
              <Input
                id="ys"
                type="date"
                value={yearStart}
                onChange={(e) => setYearStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="t2">Bắt đầu HK II</Label>
              <Input
                id="t2"
                type="date"
                value={term2Start}
                onChange={(e) => setTerm2Start(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ye">Kết thúc năm</Label>
              <Input
                id="ye"
                type="date"
                value={yearEnd}
                onChange={(e) => setYearEnd(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <span className="text-sm">Lớp học hai buổi (điểm danh sáng và chiều riêng)</span>
            <Switch checked={twoSessions} onCheckedChange={setTwoSessions} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ac">Cảnh báo khi nghỉ liên tiếp từ (buổi)</Label>
              <Input
                id="ac"
                type="number"
                min={1}
                max={30}
                value={consecutive}
                onChange={(e) =>
                  setConsecutive(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
                }
              />
            </div>
            <div>
              <Label htmlFor="au">Cảnh báo khi nghỉ không phép trong tháng từ (buổi)</Label>
              <Input
                id="au"
                type="number"
                min={1}
                max={30}
                value={unexcused}
                onChange={(e) =>
                  setUnexcused(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
                }
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-between gap-2">
            {s ? (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => void submit(false)}
              >
                Bỏ đánh dấu lớp chủ nhiệm
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Hủy
              </Button>
              <Button onClick={() => void submit(true)} disabled={busy}>
                {busy ? "Đang lưu…" : "Lưu"}
              </Button>
            </div>
          </div>
          {s ? (
            <p className="text-xs text-muted-foreground">
              Bỏ đánh dấu không xóa hồ sơ hay điểm danh đã lưu; đánh dấu lại là thấy đủ.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
