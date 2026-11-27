// Browser-side spreadsheet and print helpers for class lists and account slips.
import type { RosterCell } from "./roster";
import { displayDate } from "./roster";

export interface AccountSlip {
  fullName: string;
  birthDate: string | null;
  username: string;
  /** null when the teacher cannot see it (print a note to ask the teacher) */
  password: string | null;
}

export interface ClassListRow {
  fullName: string;
  birthDate: string | null;
  studentCode: string | null;
  username: string;
  password: string | null;
  passwordByStudent: boolean;
  locked: boolean;
}

function safeFileName(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "lop"
  );
}

const header = (text: string) => ({
  value: text,
  fontWeight: "bold" as const,
  backgroundColor: "#E8EEF7",
});

export async function readRosterFile(file: File): Promise<RosterCell[][]> {
  const { readSheet } = await import("read-excel-file/browser");
  // First sheet of the workbook, as rows of cells (dates come back as Date objects).
  return (await readSheet(file)) as RosterCell[][];
}

export async function downloadTemplate(): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    [
      [header("STT"), header("Họ và tên"), header("Ngày sinh"), header("Mã học sinh")],
      [1, "Nguyễn Văn An", "05/09/2009", "HS001"],
      [2, "Trần Thị Bình", "17/03/2009", ""],
    ],
    { columns: [{ width: 6 }, { width: 30 }, { width: 14 }, { width: 16 }], sheet: "Danh sách" },
  ).toFile("mau-danh-sach-hoc-sinh.xlsx");
}

/** The class list with usernames and current passwords, for the teacher to keep or hand out. */
export async function downloadClassList(className: string, rows: ClassListRow[]): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    [
      [
        header("STT"),
        header("Họ và tên"),
        header("Ngày sinh"),
        header("Mã học sinh"),
        header("Tên đăng nhập"),
        header("Mật khẩu"),
        header("Ghi chú"),
      ],
      ...rows.map((s, i) => [
        i + 1,
        s.fullName,
        displayDate(s.birthDate),
        s.studentCode ?? "",
        s.username,
        s.password ?? "",
        [s.passwordByStudent ? "HS tự đổi mật khẩu" : "", s.locked ? "Đã khóa" : ""]
          .filter(Boolean)
          .join(", "),
      ]),
    ],
    {
      columns: [
        { width: 6 },
        { width: 30 },
        { width: 14 },
        { width: 16 },
        { width: 18 },
        { width: 16 },
        { width: 24 },
      ],
      sheet: "Danh sách",
    },
  ).toFile(`danh-sach-${safeFileName(className)}.xlsx`);
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/** A printable page of cut-out slips, one per student, opened in a new tab. */
export function printSlips(className: string, slips: AccountSlip[], siteUrl: string): boolean {
  const cards = slips
    .map(
      (s) => `
    <div class="slip">
      <div class="cls">${escapeHtml(className)}</div>
      <div class="name">${escapeHtml(s.fullName)}${s.birthDate ? ` <span>· ${displayDate(s.birthDate)}</span>` : ""}</div>
      <table><tr><td>Tên đăng nhập</td><td class="mono">${escapeHtml(s.username)}</td></tr>
      <tr><td>Mật khẩu</td><td class="mono">${s.password ? escapeHtml(s.password) : "(hỏi giáo viên)"}</td></tr></table>
      <div class="url">Đăng nhập tại ${escapeHtml(siteUrl)}</div>
    </div>`,
    )
    .join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu tài khoản · ${escapeHtml(className)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:12mm;color:#111}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
    .slip{border:1px dashed #888;padding:10px 12px;break-inside:avoid;font-size:13px}
    .cls{font-size:11px;color:#555}.name{font-weight:bold;font-size:15px;margin:2px 0 6px}.name span{font-weight:normal;color:#555;font-size:12px}
    td{padding:2px 10px 2px 0}.mono{font-family:Consolas,monospace;font-size:16px;font-weight:bold;letter-spacing:1px}
    .url{font-size:11px;color:#555;margin-top:4px}
    @media print{body{margin:8mm}.hint{display:none}}
  </style></head><body><p class="hint">Cắt theo đường viền nét đứt và phát cho từng học sinh.</p>
  <div class="grid">${cards}</div><script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

const REPORT_TZ = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const when = (iso: string | null) => (iso ? REPORT_TZ.format(new Date(iso)) : "");
const minutes = (a: string, b: string | null) =>
  b ? Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 60_000) * 10) / 10 : "";

/**
 * The assignment's results as a workbook: the class summary, every attempt (cancelled ones
 * included), the answer-change log and the violation / connection log.
 */
export async function downloadAssignmentReport(
  report: import("./review.server").AssignmentReport,
): Promise<void> {
  const [{ default: writeXlsxFile }, { ATTEMPT_LABEL, chosenScore }, review] = await Promise.all([
    import("write-excel-file/browser"),
    import("./assignment"),
    import("./review"),
  ]);
  const names = new Map(report.students.map((s, i) => [s.id, { ...s, no: i + 1 }]));
  const nameOf = (id: string) => names.get(id)?.fullName ?? "";
  const byStudent = new Map<string, typeof report.attempts>();
  for (const a of report.attempts)
    byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a]);

  const summary = [
    [
      header("STT"),
      header("Họ và tên"),
      header("Tên đăng nhập"),
      header("Mã học sinh"),
      header("Số lượt"),
      header("Lượt bị hủy"),
      header("Lượt tính điểm"),
      header(`Điểm (thang ${report.scale})`),
      header("Trạng thái lượt cuối"),
      header("Vi phạm"),
      header("Mất mạng"),
    ],
    ...report.students.map((s, i) => {
      const list = byStudent.get(s.id) ?? [];
      const chosen = chosenScore(
        list.map((a) => ({
          ...a,
          attempt_no: a.attemptNo,
          counts: a.status !== "cancelled_network" && a.status !== "cancelled_edit",
        })),
        report.scoreRule as "latest" | "highest" | "first",
      );
      const last = list[list.length - 1];
      return [
        i + 1,
        s.fullName,
        s.username,
        s.studentCode ?? "",
        list.length,
        list.filter((a) => a.status.startsWith("cancelled")).length,
        chosen ? chosen.attemptNo : "",
        chosen?.score ?? "",
        last ? ATTEMPT_LABEL[last.status] : "Chưa làm",
        list.reduce((n, a) => n + a.violationCount, 0),
        list.reduce((n, a) => n + a.disconnectCount, 0),
      ];
    }),
  ];

  const attempts = [
    [
      header("Họ và tên"),
      header("Lượt"),
      header("Mã đề"),
      header("Trạng thái"),
      header("Tính vào số lần làm"),
      header("Bắt đầu"),
      header("Làm xong lượt đầu"),
      header("Kết thúc"),
      header("Thời gian (phút)"),
      header("Số câu đúng"),
      header("Điểm"),
      header("Vi phạm"),
      header("Mất mạng"),
      header("Câu đã sửa"),
    ],
    ...[...report.attempts]
      .sort(
        (x, y) =>
          (names.get(x.studentId)?.no ?? 0) - (names.get(y.studentId)?.no ?? 0) ||
          x.attemptNo - y.attemptNo,
      )
      .map((a) => [
        nameOf(a.studentId),
        a.attemptNo,
        a.code,
        ATTEMPT_LABEL[a.status],
        a.counts ? "Có" : "Không",
        when(a.startedAt),
        when(a.completedAllAt),
        when(a.finishedAt),
        minutes(a.startedAt, a.finishedAt),
        a.correctCount === null ? "" : `${a.correctCount}/${a.questionCount}`,
        a.score ?? "",
        a.violationCount,
        a.disconnectCount,
        a.editCount ? `${a.editCount}/${a.questionCount}` : "",
      ]),
  ];

  const edits = [
    [
      header("Họ và tên"),
      header("Lượt"),
      header("Thời điểm"),
      header("Câu"),
      header("Đáp án cũ"),
      header("Đáp án mới"),
      header("Sau khi làm xong"),
    ],
    ...report.edits.map((e) => [
      nameOf(e.studentId),
      e.attemptNo,
      when(e.at),
      e.label,
      review.answerText(e.before),
      review.answerText(e.after),
      e.afterCompletion ? "Có" : "",
    ]),
  ];

  const KIND: Record<string, string> = {
    fullscreen_exit: "Thoát toàn màn hình",
    tab_hidden: "Chuyển tab / thu nhỏ",
    window_blur: "Rời cửa sổ bài thi",
    second_device: "Đổi thiết bị",
    edit_warning: "Nhắc dấu hiệu gian lận",
    drop: "Mất kết nối",
  };
  const OUTCOME: Record<string, string> = {
    continue: "Làm tiếp",
    new_exam: "Làm đề mới, không tính lượt",
    new_exam_counted: "Làm đề mới, tính lượt",
  };
  const incidents = [
    [
      header("Họ và tên"),
      header("Lượt"),
      header("Thời điểm"),
      header("Loại"),
      header("Tính cảnh báo / tính lượt"),
      header("Thời lượng"),
      header("Xử lý"),
    ],
    ...report.incidents.map((x) => [
      nameOf(x.studentId),
      x.attemptNo,
      when(x.at),
      KIND[x.kind] ?? x.kind,
      x.counted ? "Có" : "",
      x.durationMs === null ? "" : review.seconds(x.durationMs),
      x.outcome ? (OUTCOME[x.outcome] ?? x.outcome) : "",
    ]),
  ];

  await writeXlsxFile([
    {
      data: summary,
      sheet: "Tổng hợp",
      columns: [6, 28, 16, 14, 8, 10, 12, 12, 22, 9, 9].map((width) => ({ width })),
    },
    {
      data: attempts,
      sheet: "Tất cả các lượt",
      columns: [28, 6, 14, 22, 10, 20, 20, 20, 10, 10, 8, 8, 9, 10].map((width) => ({ width })),
    },
    {
      data: edits,
      sheet: "Nhật ký sửa đáp án",
      columns: [28, 6, 20, 18, 16, 16, 12].map((width) => ({ width })),
    },
    {
      data: incidents,
      sheet: "Vi phạm và mất mạng",
      columns: [28, 6, 20, 24, 12, 16, 26].map((width) => ({ width })),
    },
  ]).toFile(`ket-qua-${safeFileName(report.title)}.xlsx`);
}
