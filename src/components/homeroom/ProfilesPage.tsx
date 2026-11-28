// Hồ sơ học sinh: searchable class list, per-student profile with guardians, Excel import/export
// and a printable class list. Names, birth dates and codes are edited on the accounts page.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  ImagePlus,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  importProfiles,
  listProfiles,
  saveProfile,
  type StudentProfile,
} from "@/lib/homeroom/homeroom.functions";
import {
  GENDER_LABEL,
  STATUSES,
  STATUS_LABEL,
  byGivenName,
  isActive,
  normalizeGuardians,
  parseProfileSheet,
  primaryGuardian,
  type Guardian,
  type Profile,
  type ProfileImport,
  type StudentStatus,
} from "@/lib/homeroom/profiles";
import { displayDate } from "@/lib/exam/roster";
import { nameKey } from "@/lib/exam/accounts";
import { errorText, type HomeroomContext } from "./HomeroomFrame";
import { downloadProfiles, printTable, readSheetFile } from "./sheets";

type Filter = "active" | "all" | StudentStatus;

export function ProfilesPage({ cls }: HomeroomContext) {
  const list = useServerFn(listProfiles);
  const [students, setStudents] = useState<StudentProfile[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<StudentProfile | null>(null);
  const [importing, setImporting] = useState<ProfileImport | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setStudents((await list({ data: { classId: cls.id } })).sort(byGivenName));
      setError("");
    } catch (e) {
      setStudents([]);
      setError(errorText(e));
    }
  }, [list, cls.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = nameKey(query);
    return (students ?? []).filter((s) => {
      if (filter === "active" ? !isActive(s.status) : filter !== "all" && s.status !== filter)
        return false;
      if (!q) return true;
      const g = primaryGuardian(s.guardians);
      return [
        s.fullName,
        s.studentCode ?? "",
        g?.fullName ?? "",
        g?.phone ?? "",
        s.profile.classRole,
      ].some((x) => nameKey(x).includes(q));
    });
  }, [students, query, filter]);

  const printHead = [
    "STT",
    "Họ và tên",
    "Ngày sinh",
    "Giới tính",
    "Chức vụ",
    "Tổ",
    "Phụ huynh",
    "Điện thoại",
  ];
  const printRows = shown.map((s, i) => {
    const g = primaryGuardian(s.guardians);
    return [
      i + 1,
      s.fullName,
      displayDate(s.birthDate),
      s.profile.gender ? GENDER_LABEL[s.profile.gender] : "",
      s.profile.classRole,
      s.profile.groupName,
      g ? `${g.fullName}${g.relation ? ` (${g.relation})` : ""}` : "",
      g?.phone ?? "",
    ];
  });

  return (
    <div className="grid gap-4">
      <section className="site-card grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Tìm tên, mã học sinh, phụ huynh, số điện thoại…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Lọc theo trạng thái"
          >
            <option value="active">Đang học</option>
            <option value="all">Tất cả</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!students?.length}
            onClick={() => void downloadProfiles(cls.name, students ?? [])}
          >
            <Download /> Xuất Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!students?.length}
            onClick={() => fileRef.current?.click()}
          >
            <Upload /> Nhập Excel
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || !students) return;
              void readSheetFile(f)
                .then((rows) => setImporting(parseProfileSheet(rows, students)))
                .catch(() => setError("Không đọc được file. Hãy dùng file .xlsx."));
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!shown.length}
            onClick={() => {
              if (
                !printTable(
                  `Danh sách lớp ${cls.name}`,
                  cls.schoolYear ? `Năm học ${cls.schoolYear}` : "",
                  printHead,
                  printRows,
                )
              )
                setError("Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.");
            }}
          >
            <Printer /> In danh sách
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/lop-thi">
              <Plus /> Thêm / sửa tên học sinh
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Mẹo: bấm Xuất Excel, điền thêm giới tính, địa chỉ, phụ huynh… vào file rồi Nhập Excel lại.
          Ô để trống không xóa dữ liệu cũ. Ghi chú riêng và diện cần quan tâm không đưa ra file.
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      {students === null ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="site-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">STT</th>
                <th className="px-3 py-2">Học sinh</th>
                <th className="px-3 py-2">Ngày sinh</th>
                <th className="px-3 py-2">Giới tính</th>
                <th className="px-3 py-2">Chức vụ · Tổ</th>
                <th className="px-3 py-2">Liên hệ chính</th>
                <th className="px-3 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((s, i) => {
                const g = primaryGuardian(s.guardians);
                return (
                  <tr
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setEditing(s)}
                  >
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar photo={s.photo} />
                        <div>
                          <div className="font-medium">{s.fullName}</div>
                          {s.studentCode ? (
                            <div className="text-xs text-muted-foreground">{s.studentCode}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{displayDate(s.birthDate)}</td>
                    <td className="px-3 py-2">
                      {s.profile.gender ? (
                        GENDER_LABEL[s.profile.gender]
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {[s.profile.classRole, s.profile.groupName && `Tổ ${s.profile.groupName}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td className="px-3 py-2">
                      {g ? (
                        <>
                          {g.fullName}
                          {g.relation ? (
                            <span className="text-muted-foreground"> ({g.relation})</span>
                          ) : null}
                          {g.phone ? (
                            <a
                              href={`tel:${g.phone}`}
                              className="ml-2 inline-flex items-center gap-1 text-primary"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3 w-3" />
                              {g.phone}
                            </a>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Chưa có</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{STATUS_LABEL[s.status]}</td>
                  </tr>
                );
              })}
              {!shown.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    {students.length ? "Không có học sinh phù hợp." : "Lớp chưa có học sinh."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <ProfileDialog
          classId={cls.id}
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice("Đã lưu hồ sơ.");
            await load();
          }}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          classId={cls.id}
          result={importing}
          onClose={() => setImporting(null)}
          onSaved={async (n) => {
            setImporting(null);
            setNotice(`Đã cập nhật hồ sơ của ${n} học sinh.`);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function Avatar({ photo, size = 32 }: { photo: string | null; size?: number }) {
  return photo ? (
    <img
      src={photo}
      alt=""
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground"
      style={{ width: size, height: size }}
    >
      <UserRound className="h-1/2 w-1/2" />
    </span>
  );
}

/** Shrink a picked photo to a small square JPEG data URL (≈5–15 KB). */
async function squarePhoto(file: File, px = 160): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    canvas
      .getContext("2d")!
      .drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        px,
        px,
      );
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const blankGuardian = (): Guardian => ({
  fullName: "",
  relation: "",
  phone: "",
  zalo: "",
  isPrimary: false,
});

function ProfileDialog({
  classId,
  student,
  onClose,
  onSaved,
}: {
  classId: string;
  student: StudentProfile;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const save = useServerFn(saveProfile);
  const [p, setP] = useState<Profile>(student.profile);
  const [guardians, setGuardians] = useState<Guardian[]>(
    student.guardians.length
      ? student.guardians.map(({ id: _id, ...g }) => g)
      : [{ ...blankGuardian(), isPrimary: true }],
  );
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const shownPhoto = photo === undefined ? student.photo : photo;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save({
        data: {
          classId,
          studentId: student.id,
          profile: p,
          guardians: normalizeGuardians(guardians),
          ...(photo === undefined ? {} : { photo }),
        },
      });
      await onSaved();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const field = (id: keyof Profile, label: string, max: number, placeholder = "") => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        maxLength={max}
        placeholder={placeholder}
        value={(p[id] as string) ?? ""}
        onChange={(e) => set(id, e.target.value as never)}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative"
            onClick={() => photoRef.current?.click()}
            title="Đổi ảnh"
          >
            <Avatar photo={shownPhoto ?? null} size={56} />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1 text-primary-foreground">
              <ImagePlus className="h-3 w-3" />
            </span>
          </button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void squarePhoto(f).then(setPhoto, () => setError("Không đọc được ảnh"));
            }}
          />
          <div>
            <DialogTitle>{student.fullName}</DialogTitle>
            <DialogDescription>
              {displayDate(student.birthDate) || "Chưa có ngày sinh"}
              {student.studentCode ? ` · ${student.studentCode}` : ""}
              {shownPhoto ? (
                <button
                  type="button"
                  className="ml-2 text-xs underline"
                  onClick={() => setPhoto(null)}
                >
                  Xóa ảnh
                </button>
              ) : null}
            </DialogDescription>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Giới tính</Label>
            <div className="flex gap-1">
              {(["nam", "nu"] as const).map((g) => (
                <Button
                  key={g}
                  type="button"
                  size="sm"
                  variant={p.gender === g ? "default" : "outline"}
                  onClick={() => set("gender", p.gender === g ? null : g)}
                >
                  {GENDER_LABEL[g]}
                </Button>
              ))}
            </div>
          </div>
          {field("ethnicity", "Dân tộc", 30, "Kinh")}
          <div>
            <Label htmlFor="status">Trạng thái</Label>
            <div className="flex gap-1">
              <select
                id="status"
                className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                value={p.status}
                onChange={(e) => set("status", e.target.value as StudentStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {p.status !== "dang_hoc" ? (
            <div>
              <Label htmlFor="sd">Từ ngày</Label>
              <Input
                id="sd"
                type="date"
                value={p.statusDate ?? ""}
                onChange={(e) => set("statusDate", e.target.value || null)}
              />
            </div>
          ) : null}
          {field("classRole", "Chức vụ trong lớp", 50, "Lớp trưởng, tổ trưởng…")}
          {field("groupName", "Tổ / nhóm", 30, "1")}
          {field("seat", "Chỗ ngồi", 10, "Dãy 2 – bàn 3")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("permanentAddress", "Địa chỉ thường trú", 200)}
          {field("currentAddress", "Nơi ở hiện tại", 200, "Bỏ trống nếu giống thường trú")}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Cha mẹ / người giám hộ</Label>
            {guardians.length < 6 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setGuardians((g) => [...g, blankGuardian()])}
              >
                <Plus /> Thêm người
              </Button>
            ) : null}
          </div>
          {guardians.map((g, i) => {
            const upd = (v: Partial<Guardian>) =>
              setGuardians((list) => list.map((x, j) => (j === i ? { ...x, ...v } : x)));
            return (
              <div
                key={i}
                className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[1.4fr_0.8fr_1fr_1fr_auto]"
              >
                <Input
                  placeholder="Họ tên"
                  maxLength={100}
                  value={g.fullName}
                  onChange={(e) => upd({ fullName: e.target.value })}
                />
                <Input
                  placeholder="Quan hệ (bố, mẹ…)"
                  maxLength={30}
                  value={g.relation}
                  onChange={(e) => upd({ relation: e.target.value })}
                />
                <Input
                  placeholder="Số điện thoại"
                  inputMode="tel"
                  maxLength={20}
                  value={g.phone}
                  onChange={(e) => upd({ phone: e.target.value })}
                />
                <Input
                  placeholder="Zalo"
                  inputMode="tel"
                  maxLength={20}
                  value={g.zalo}
                  onChange={(e) => upd({ zalo: e.target.value })}
                />
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-1 whitespace-nowrap text-xs">
                    <input
                      type="radio"
                      name="primary"
                      checked={g.isPrimary}
                      onChange={() =>
                        setGuardians((list) => list.map((x, j) => ({ ...x, isPrimary: j === i })))
                      }
                    />
                    Liên hệ chính
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Xóa người này"
                    onClick={() => setGuardians((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="care">Diện cần quan tâm (chỉ GVCN xem)</Label>
            <Textarea
              id="care"
              rows={2}
              maxLength={300}
              placeholder="Hoàn cảnh khó khăn, khuyết tật, con liệt sĩ…"
              value={p.careNote}
              onChange={(e) => set("careNote", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="note">Ghi chú riêng của GVCN</Label>
            <Textarea
              id="note"
              rows={2}
              maxLength={2000}
              value={p.privateNote}
              onChange={(e) => set("privateNote", e.target.value)}
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu hồ sơ"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  classId,
  result,
  onClose,
  onSaved,
}: {
  classId: string;
  result: ProfileImport;
  onClose: () => void;
  onSaved: (n: number) => Promise<void>;
}) {
  const run = useServerFn(importProfiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogTitle>Nhập hồ sơ từ Excel</DialogTitle>
        <DialogDescription>
          Tìm thấy {result.rows.length} học sinh trong lớp. Chỉ những ô có nội dung mới được cập
          nhật.
        </DialogDescription>
        {result.problems.length ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <b>{result.problems.length} vấn đề (các dòng này sẽ bỏ qua phần lỗi):</b>
            <ul className="mt-1 list-disc pl-5">
              {result.problems.slice(0, 30).map((p, i) => (
                <li key={i}>
                  Dòng {p.row}: {p.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button
            disabled={busy || !result.rows.length}
            onClick={() => {
              setBusy(true);
              void run({
                data: {
                  classId,
                  rows: result.rows.map((r) => ({
                    studentId: r.studentId,
                    profile: r.profile,
                    guardian: r.guardian,
                  })),
                },
              })
                .then((r) => onSaved(r.saved))
                .catch((e) => {
                  setError(errorText(e));
                  setBusy(false);
                });
            }}
          >
            {busy ? "Đang lưu…" : `Cập nhật ${result.rows.length} hồ sơ`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
