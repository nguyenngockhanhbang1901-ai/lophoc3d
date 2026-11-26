import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileSpreadsheet,
  History,
  KeyRound,
  Lock,
  LockOpen,
  MoveRight,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  addStudents,
  deleteExamClass,
  deleteStudents,
  listClassStudents,
  listExamClasses,
  moveStudents,
  resetPasswords,
  saveExamClass,
  setStudentsLocked,
  studentLoginLog,
  updateStudent,
  type ExamClassSummary,
  type ExamStudentSummary,
  type IssuedAccount,
} from "@/lib/exam/classes.functions";
import { parseRoster, displayDate, type RosterResult, type RosterStudent } from "@/lib/exam/roster";
import {
  downloadAccounts,
  downloadClassList,
  downloadTemplate,
  printSlips,
  readRosterFile,
} from "@/lib/exam/files";

const GROUP = 10;

type DialogKind =
  | { kind: "class"; edit?: ExamClassSummary }
  | { kind: "delete-class" }
  | { kind: "import" }
  | { kind: "add" }
  | { kind: "edit-student"; student: ExamStudentSummary }
  | { kind: "issued"; title: string; slips: IssuedAccount[] }
  | { kind: "move" }
  | { kind: "delete-students" }
  | { kind: "log"; student: ExamStudentSummary }
  | null;

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

function when(iso: string | null): string {
  if (!iso) return "Chưa đăng nhập";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TeacherClasses() {
  const listClasses = useServerFn(listExamClasses);
  const saveClass = useServerFn(saveExamClass);
  const removeClass = useServerFn(deleteExamClass);
  const listStudents = useServerFn(listClassStudents);
  const add = useServerFn(addStudents);
  const reset = useServerFn(resetPasswords);
  const lock = useServerFn(setStudentsLocked);
  const move = useServerFn(moveStudents);
  const removeStudents = useServerFn(deleteStudents);
  const editStudent = useServerFn(updateStudent);
  const loginLog = useServerFn(studentLoginLog);

  const [classes, setClasses] = useState<ExamClassSummary[] | null>(null);
  const [classId, setClassId] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [students, setStudents] = useState<ExamStudentSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const current = classes?.find((c) => c.id === classId) ?? null;
  const visibleClasses = useMemo(
    () => (classes ?? []).filter((c) => showArchived || !c.archived || c.id === classId),
    [classes, showArchived, classId],
  );

  const loadClasses = useCallback(async () => {
    try {
      const list = await listClasses();
      setClasses(list);
      setClassId((id) =>
        list.some((c) => c.id === id) ? id : (list.find((c) => !c.archived)?.id ?? ""),
      );
    } catch (e) {
      setClasses([]);
      setError(message(e));
    }
  }, [listClasses]);

  const loadStudents = useCallback(
    async (id: string) => {
      if (!id) {
        setStudents([]);
        return;
      }
      try {
        setStudents(await listStudents({ data: { classId: id } }));
      } catch (e) {
        setError(message(e));
      }
    },
    [listStudents],
  );

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);
  useEffect(() => {
    setSelected(new Set());
    void loadStudents(classId);
  }, [classId, loadStudents]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const refresh = async () => {
    await Promise.all([loadClasses(), loadStudents(classId)]);
    setSelected(new Set());
  };

  const selectedIds = [...selected];
  const allChecked = students.length > 0 && selected.size === students.length;

  async function issuePasswords(ids: string[]) {
    if (!current) return;
    const slips: IssuedAccount[] = [];
    for (let i = 0; i < ids.length; i += GROUP)
      slips.push(
        ...(await reset({ data: { classId: current.id, studentIds: ids.slice(i, i + GROUP) } })),
      );
    setDialog({
      kind: "issued",
      title:
        slips.length === 1
          ? `Mật khẩu mới của ${slips[0]?.fullName}`
          : `Mật khẩu mới cho ${slips.length} học sinh`,
      slips,
    });
    await refresh();
  }

  if (classes === null) return <p className="text-muted-foreground">Đang tải…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Lớp của tôi</h2>
          <Button size="sm" onClick={() => setDialog({ kind: "class" })}>
            <Plus />
            Tạo lớp
          </Button>
        </div>
        {visibleClasses.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có lớp nào. Bấm Tạo lớp để bắt đầu.</p>
        )}
        <ul className="grid gap-1">
          {visibleClasses.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setClassId(c.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${c.id === classId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <div className="font-medium">
                  {c.name}
                  {c.archived ? " · đã lưu trữ" : ""}
                </div>
                <div className="text-xs opacity-80">
                  {[c.subject, c.schoolYear].filter(Boolean).join(" · ") || "—"} · {c.studentCount}{" "}
                  học sinh
                </div>
              </button>
            </li>
          ))}
        </ul>
        {(classes ?? []).some((c) => c.archived) && (
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Hiện lớp đã lưu trữ
          </label>
        )}
      </aside>

      <section className="min-w-0 rounded-lg border bg-card p-4">
        {error && (
          <p className="error-note mb-3" role="alert">
            {error}
          </p>
        )}
        {!current ? (
          <p className="text-muted-foreground">Chọn hoặc tạo một lớp để quản lý học sinh.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">{current.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {[current.subject, current.schoolYear].filter(Boolean).join(" · ")} ·{" "}
                  {students.length} học sinh
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog({ kind: "class", edit: current })}
                >
                  <Pencil />
                  Sửa lớp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await saveClass({
                        data: {
                          id: current.id,
                          name: current.name,
                          schoolYear: current.schoolYear,
                          subject: current.subject,
                          archived: !current.archived,
                        },
                      });
                      await loadClasses();
                    })
                  }
                >
                  {current.archived ? (
                    <>
                      <ArchiveRestore />
                      Bỏ lưu trữ
                    </>
                  ) : (
                    <>
                      <Archive />
                      Lưu trữ
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog({ kind: "delete-class" })}
                >
                  <Trash2 />
                  Xóa lớp
                </Button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setDialog({ kind: "import" })}>
                <Upload />
                Nhập từ Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "add" })}>
                <UserPlus />
                Thêm học sinh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void downloadTemplate();
                }}
              >
                <FileSpreadsheet />
                Tải file mẫu
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!students.length}
                onClick={() => {
                  void downloadClassList(current.name, students);
                }}
              >
                <Download />
                Xuất danh sách
              </Button>
            </div>

            {selected.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm">
                <strong className="mr-1">Đã chọn {selected.size}</strong>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => issuePasswords(selectedIds))}
                >
                  <KeyRound />
                  Cấp lại mật khẩu
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await lock({
                        data: { classId: current.id, studentIds: selectedIds, locked: true },
                      });
                      await refresh();
                    })
                  }
                >
                  <Lock />
                  Khóa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await lock({
                        data: { classId: current.id, studentIds: selectedIds, locked: false },
                      });
                      await refresh();
                    })
                  }
                >
                  <LockOpen />
                  Mở khóa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || (classes ?? []).length < 2}
                  onClick={() => setDialog({ kind: "move" })}
                >
                  <MoveRight />
                  Chuyển lớp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDialog({ kind: "delete-students" })}
                >
                  <Trash2 />
                  Xóa
                </Button>
              </div>
            )}

            {students.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Lớp chưa có học sinh. Nhập danh sách từ Excel hoặc thêm từng em.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="p-2">
                        <input
                          type="checkbox"
                          aria-label="Chọn tất cả"
                          checked={allChecked}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked ? new Set(students.map((s) => s.id)) : new Set(),
                            )
                          }
                        />
                      </th>
                      <th className="p-2">STT</th>
                      <th className="p-2">Họ và tên</th>
                      <th className="p-2">Ngày sinh</th>
                      <th className="p-2">Mã HS</th>
                      <th className="p-2">Tên đăng nhập</th>
                      <th className="p-2">Trạng thái</th>
                      <th className="p-2">Đăng nhập gần nhất</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            aria-label={`Chọn ${s.fullName}`}
                            checked={selected.has(s.id)}
                            onChange={(e) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(s.id);
                                else next.delete(s.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="p-2">{i + 1}</td>
                        <td className="p-2 font-medium">{s.fullName}</td>
                        <td className="p-2">{displayDate(s.birthDate)}</td>
                        <td className="p-2">{s.studentCode ?? ""}</td>
                        <td className="p-2 font-mono">{s.username}</td>
                        <td className="p-2">
                          {s.locked ? (
                            <span className="text-destructive">Đã khóa</span>
                          ) : (
                            "Đang dùng"
                          )}
                        </td>
                        <td className="p-2 text-xs">{when(s.lastLoginAt)}</td>
                        <td className="whitespace-nowrap p-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Cấp lại mật khẩu"
                            disabled={busy}
                            onClick={() => run(() => issuePasswords([s.id]))}
                          >
                            <KeyRound />
                            <span className="sr-only">Cấp lại mật khẩu</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Sửa thông tin"
                            onClick={() => setDialog({ kind: "edit-student", student: s })}
                          >
                            <Pencil />
                            <span className="sr-only">Sửa</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Nhật ký đăng nhập"
                            onClick={() => setDialog({ kind: "log", student: s })}
                          >
                            <History />
                            <span className="sr-only">Nhật ký</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Mật khẩu được mã hóa nên không xem lại được. Học sinh quên mật khẩu thì bấm biểu tượng
              chìa khóa để cấp mật khẩu mới và gửi cho em.
            </p>
          </>
        )}
      </section>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent
          className={
            dialog?.kind === "import" || dialog?.kind === "issued" ? "max-w-3xl" : undefined
          }
        >
          {dialog?.kind === "class" && (
            <ClassForm
              initial={dialog.edit}
              busy={busy}
              onSubmit={(values) =>
                run(async () => {
                  const { id } = await saveClass({ data: { ...values, id: dialog.edit?.id } });
                  await loadClasses();
                  setClassId(id);
                  setDialog(null);
                })
              }
            />
          )}
          {dialog?.kind === "delete-class" && current && (
            <>
              <DialogTitle>Xóa lớp {current.name}?</DialogTitle>
              <DialogDescription>
                Xóa lớp sẽ xóa luôn {current.studentCount} tài khoản học sinh và không khôi phục
                được. Nếu chỉ muốn ẩn lớp, hãy chọn Lưu trữ.
              </DialogDescription>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Hủy
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await removeClass({ data: { id: current.id } });
                      setClassId("");
                      setDialog(null);
                      await loadClasses();
                    })
                  }
                >
                  Xóa lớp
                </Button>
              </div>
            </>
          )}
          {dialog?.kind === "import" && current && (
            <ImportRoster
              existing={students}
              busy={busy}
              onCreate={(rows, onProgress) =>
                run(async () => {
                  const created: IssuedAccount[] = [];
                  const problems: string[] = [];
                  for (let i = 0; i < rows.length; i += GROUP) {
                    const part = rows.slice(i, i + GROUP);
                    try {
                      const r = await add({
                        data: {
                          classId: current.id,
                          students: part.map((s) => ({
                            fullName: s.fullName,
                            birthDate: s.birthDate,
                            studentCode: s.studentCode,
                          })),
                        },
                      });
                      created.push(...r.created);
                      problems.push(...r.problems.map((p) => `${p.fullName}: ${p.message}`));
                    } catch (e) {
                      problems.push(...part.map((s) => `${s.fullName}: ${message(e)}`));
                    }
                    onProgress(Math.min(rows.length, i + GROUP));
                  }
                  await refresh();
                  if (problems.length)
                    setError(
                      `Không tạo được ${problems.length} tài khoản: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "…" : ""}`,
                    );
                  setDialog(
                    created.length
                      ? {
                          kind: "issued",
                          title: `Đã tạo ${created.length} tài khoản`,
                          slips: created,
                        }
                      : null,
                  );
                })
              }
            />
          )}
          {dialog?.kind === "add" && current && (
            <StudentForm
              title="Thêm học sinh"
              busy={busy}
              onSubmit={(v) =>
                run(async () => {
                  const r = await add({ data: { classId: current.id, students: [v] } });
                  if (r.problems.length)
                    throw new Error(r.problems[0]?.message ?? "Không thêm được");
                  await refresh();
                  setDialog({
                    kind: "issued",
                    title: `Tài khoản của ${v.fullName}`,
                    slips: r.created,
                  });
                })
              }
            />
          )}
          {dialog?.kind === "edit-student" && current && (
            <StudentForm
              title={`Sửa thông tin · ${dialog.student.username}`}
              initial={dialog.student}
              busy={busy}
              onSubmit={(v) =>
                run(async () => {
                  await editStudent({
                    data: { classId: current.id, studentId: dialog.student.id, ...v },
                  });
                  await refresh();
                  setDialog(null);
                })
              }
            />
          )}
          {dialog?.kind === "issued" && current && (
            <IssuedAccounts title={dialog.title} className={current.name} slips={dialog.slips} />
          )}
          {dialog?.kind === "move" && current && (
            <MoveForm
              classes={(classes ?? []).filter((c) => c.id !== current.id)}
              count={selected.size}
              busy={busy}
              onSubmit={(toClassId) =>
                run(async () => {
                  await move({ data: { classId: current.id, studentIds: selectedIds, toClassId } });
                  await refresh();
                  setDialog(null);
                })
              }
            />
          )}
          {dialog?.kind === "delete-students" && current && (
            <>
              <DialogTitle>Xóa {selected.size} học sinh?</DialogTitle>
              <DialogDescription>
                Tài khoản và toàn bộ dữ liệu của các em sẽ bị xóa, không khôi phục được. Nếu chỉ
                muốn chặn đăng nhập, hãy chọn Khóa.
              </DialogDescription>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Hủy
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await removeStudents({
                        data: { classId: current.id, studentIds: selectedIds },
                      });
                      await refresh();
                      setDialog(null);
                    })
                  }
                >
                  Xóa
                </Button>
              </div>
            </>
          )}
          {dialog?.kind === "log" && current && (
            <LoginLog
              student={dialog.student}
              load={() => loginLog({ data: { classId: current.id, studentId: dialog.student.id } })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClassForm({
  initial,
  busy,
  onSubmit,
}: {
  initial?: ExamClassSummary | undefined;
  busy: boolean;
  onSubmit: (v: { name: string; schoolYear: string; subject: string }) => void;
}) {
  const year = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [name, setName] = useState(initial?.name ?? "");
  const [schoolYear, setSchoolYear] = useState(initial?.schoolYear ?? `${year}-${year + 1}`);
  const [subject, setSubject] = useState(initial?.subject ?? "Toán");
  return (
    <>
      <DialogTitle>{initial ? "Sửa lớp" : "Tạo lớp mới"}</DialogTitle>
      <DialogDescription>Mỗi lớp có danh sách học sinh và tài khoản riêng.</DialogDescription>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, schoolYear, subject });
        }}
      >
        <label>
          Tên lớp
          <Input
            required
            maxLength={100}
            placeholder="Ví dụ: 11A1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Năm học
          <Input
            maxLength={20}
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
          />
        </label>
        <label>
          Môn
          <Input maxLength={60} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <Button disabled={busy}>{busy ? "Đang lưu…" : initial ? "Lưu" : "Tạo lớp"}</Button>
      </form>
    </>
  );
}

function StudentForm({
  title,
  initial,
  busy,
  onSubmit,
}: {
  title: string;
  initial?: ExamStudentSummary;
  busy: boolean;
  onSubmit: (v: { fullName: string; birthDate: string | null; studentCode: string | null }) => void;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [studentCode, setStudentCode] = useState(initial?.studentCode ?? "");
  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        {initial
          ? "Tên đăng nhập và mật khẩu không đổi."
          : "Hệ thống tự tạo tên đăng nhập và mật khẩu."}
      </DialogDescription>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            fullName,
            birthDate: birthDate || null,
            studentCode: studentCode.trim() || null,
          });
        }}
      >
        <label>
          Họ và tên
          <Input
            required
            maxLength={100}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label>
          Ngày sinh
          <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </label>
        <label>
          Mã học sinh (nếu có)
          <Input
            maxLength={30}
            value={studentCode}
            onChange={(e) => setStudentCode(e.target.value)}
          />
        </label>
        <Button disabled={busy}>
          {busy ? "Đang lưu…" : initial ? "Lưu" : "Thêm và tạo tài khoản"}
        </Button>
      </form>
    </>
  );
}

function ImportRoster({
  existing,
  busy,
  onCreate,
}: {
  existing: ExamStudentSummary[];
  busy: boolean;
  onCreate: (rows: RosterStudent[], onProgress: (n: number) => void) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<RosterResult | null>(null);
  const [readError, setReadError] = useState("");
  const [done, setDone] = useState(0);
  async function choose(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setReadError("");
    try {
      const rows = await readRosterFile(file);
      setResult(parseRoster(rows, existing));
    } catch {
      setReadError(
        "Không đọc được file. Hãy dùng file Excel .xlsx (có thể lưu lại từ Excel bằng Save As → .xlsx).",
      );
    }
  }
  const total = result?.students.length ?? 0;
  return (
    <>
      <DialogTitle>Nhập danh sách từ Excel</DialogTitle>
      <DialogDescription>
        File .xlsx có cột Họ và tên (hoặc hai cột Họ và Tên), có thể thêm Ngày sinh và Mã học sinh.
        Dòng tiêu đề có thể nằm dưới tên trường, tên lớp.
      </DialogDescription>
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
        }}
        disabled={busy}
      />
      {readError && (
        <p className="error-note" role="alert">
          {readError}
        </p>
      )}
      {result && (
        <div className="grid gap-3">
          <p className="text-sm">
            <strong>{fileName}</strong>: {total} học sinh hợp lệ
            {result.problems.length ? `, ${result.problems.length} dòng có lỗi` : ""}.
          </p>
          {result.problems.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
              <p className="mb-1 font-medium text-destructive">
                Các dòng sau sẽ không được nhập — sửa trong file rồi nhập lại nếu cần:
              </p>
              <ul className="list-disc pl-5">
                {result.problems.map((p) => (
                  <li key={`${p.row}-${p.message}`}>
                    Dòng {p.row}: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {total > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-2">Dòng</th>
                    <th className="p-2">Họ và tên</th>
                    <th className="p-2">Ngày sinh</th>
                    <th className="p-2">Mã HS</th>
                  </tr>
                </thead>
                <tbody>
                  {result.students.map((s) => (
                    <tr key={s.row} className="border-b last:border-0">
                      <td className="p-2">{s.row}</td>
                      <td className="p-2">{s.fullName}</td>
                      <td className="p-2">{displayDate(s.birthDate)}</td>
                      <td className="p-2">{s.studentCode ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {busy && (
            <p className="text-sm">
              Đang tạo tài khoản… {done}/{total}
            </p>
          )}
          <Button
            disabled={busy || total === 0}
            onClick={() => {
              setDone(0);
              onCreate(result.students, setDone);
            }}
          >
            Tạo {total} tài khoản
          </Button>
        </div>
      )}
    </>
  );
}

function IssuedAccounts({
  title,
  className,
  slips,
}: {
  title: string;
  className: string;
  slips: IssuedAccount[];
}) {
  const [printBlocked, setPrintBlocked] = useState(false);
  const site = typeof window === "undefined" ? "" : `${window.location.origin}/hoc-sinh`;
  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        Mật khẩu chỉ hiển thị lần này. Hãy tải file Excel hoặc in phiếu trước khi đóng.
      </DialogDescription>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            void downloadAccounts(className, slips);
          }}
        >
          <Download />
          Tải Excel
        </Button>
        <Button
          variant="outline"
          onClick={() => setPrintBlocked(!printSlips(className, slips, site))}
        >
          <Printer />
          In phiếu
        </Button>
      </div>
      {printBlocked && (
        <p className="error-note">
          Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi bấm lại.
        </p>
      )}
      <div className="max-h-80 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Họ và tên</th>
              <th className="p-2">Tên đăng nhập</th>
              <th className="p-2">Mật khẩu</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-2">{s.fullName}</td>
                <td className="p-2 font-mono">{s.username}</td>
                <td className="p-2 font-mono font-semibold">{s.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Học sinh đăng nhập tại <span className="font-mono">{site}</span>
      </p>
    </>
  );
}

function MoveForm({
  classes,
  count,
  busy,
  onSubmit,
}: {
  classes: ExamClassSummary[];
  count: number;
  busy: boolean;
  onSubmit: (classId: string) => void;
}) {
  const [target, setTarget] = useState(classes[0]?.id ?? "");
  return (
    <>
      <DialogTitle>Chuyển {count} học sinh sang lớp khác</DialogTitle>
      <DialogDescription>Tài khoản và mật khẩu của các em giữ nguyên.</DialogDescription>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (target) onSubmit(target);
        }}
      >
        <label>
          Lớp mới
          <select
            className="entry-select"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.schoolYear ? ` · ${c.schoolYear}` : ""}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy || !target}>Chuyển lớp</Button>
      </form>
    </>
  );
}

function LoginLog({
  student,
  load,
}: {
  student: ExamStudentSummary;
  load: () => Promise<{ at: string; success: boolean; userAgent: string }[]>;
}) {
  const [rows, setRows] = useState<{ at: string; success: boolean; userAgent: string }[] | null>(
    null,
  );
  useEffect(() => {
    void load()
      .then(setRows)
      .catch(() => setRows([]));
  }, [load]);
  return (
    <>
      <DialogTitle>Nhật ký đăng nhập · {student.fullName}</DialogTitle>
      <DialogDescription>50 lần gần nhất.</DialogDescription>
      {rows === null ? (
        <p>Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có lần đăng nhập nào.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.at} className="border-b last:border-0">
                  <td className="p-2 whitespace-nowrap">{when(r.at)}</td>
                  <td className="p-2">
                    {r.success ? (
                      "Thành công"
                    ) : (
                      <span className="text-destructive">Sai mật khẩu / bị khóa</span>
                    )}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{deviceName(r.userAgent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function deviceName(ua: string): string {
  if (/iPhone|iPad/.test(ua)) return "iPhone/iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Máy tính Windows";
  if (/Macintosh/.test(ua)) return "Máy Mac";
  if (/Linux/.test(ua)) return "Máy Linux";
  return ua ? "Thiết bị khác" : "";
}
