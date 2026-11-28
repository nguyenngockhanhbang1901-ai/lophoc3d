// The score table of one book: type a score and press Enter (moves down) or Tab; each cell is
// saved on its own. Bonus/penalty columns open a dialog; the average follows Thông tư 22.
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveScores, type BookData } from "@/lib/gradebook/gradebook.functions";
import {
  BEHAVIOR_LABEL,
  BEHAVIOR_POSITIVE,
  effectiveValues,
  formatScore,
  isNumeric,
  parseScore,
  scoreClass,
  termAverage,
  type BehaviorKind,
  type BookColumn,
  type Values,
} from "@/lib/gradebook/scores";
import { byGivenName, isActive, STATUS_LABEL } from "@/lib/homeroom/profiles";
import { errorText } from "./files";

export type Student = BookData["students"][number];

export function sortedStudents(data: BookData): Student[] {
  const list = data.students.slice().sort(byGivenName);
  return [...list.filter((s) => isActive(s.status)), ...list.filter((s) => !isActive(s.status))];
}

export function studentValues(data: BookData) {
  const raw = new Map<string, Values>();
  const txt = new Map<string, Record<string, string | null>>();
  for (const s of data.scores) {
    raw.set(s.studentId, { ...(raw.get(s.studentId) ?? {}), [s.key]: s.num });
    txt.set(s.studentId, { ...(txt.get(s.studentId) ?? {}), [s.key]: s.txt });
  }
  const bonus = new Map(data.bonus.map((b) => [b.studentId, b]));
  return { raw, txt, bonus };
}

function countsText(c: Partial<Record<BehaviorKind, number>> | undefined): {
  good: number;
  bad: number;
  title: string;
} {
  let good = 0;
  let bad = 0;
  const parts: string[] = [];
  for (const [k, n] of Object.entries(c ?? {}) as [BehaviorKind, number][]) {
    if (BEHAVIOR_POSITIVE[k]) good += n;
    else bad += n;
    parts.push(`${BEHAVIOR_LABEL[k]}: ${n}`);
  }
  return { good, bad, title: parts.join("\n") || "Chưa có ghi nhận" };
}

export function ScoreGrid({
  data,
  onChanged,
  onBonus,
}: {
  data: BookData;
  onChanged: (
    cells: { studentId: string; key: string; num: number | null; txt: string | null }[],
  ) => void;
  onBonus: (student: Student) => void;
}) {
  const save = useServerFn(saveScores);
  const cols = data.book.columns;
  const students = useMemo(() => sortedStudents(data), [data]);
  const { raw, txt, bonus } = useMemo(() => studentValues(data), [data]);
  const [error, setError] = useState("");
  const tableRef = useRef<HTMLTableElement>(null);

  async function commit(studentId: string, col: BookColumn, text: string) {
    let cell: { studentId: string; key: string; num: number | null; txt: string | null };
    if (isNumeric(col)) {
      const v = parseScore(text);
      if (v === "invalid") return false;
      if ((raw.get(studentId)?.[col.key] ?? null) === v) return true;
      cell = { studentId, key: col.key, num: v, txt: null };
    } else {
      const t = text.trim();
      if ((txt.get(studentId)?.[col.key] ?? "") === t) return true;
      cell = { studentId, key: col.key, num: null, txt: t || null };
    }
    try {
      await save({ data: { bookId: data.book.id, cells: [cell] } });
      onChanged([cell]);
      setError("");
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  function focusCell(row: number, col: number) {
    const el = tableRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-cell="${row}:${col}"]`,
    );
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }

  const hasBonus = !!data.book.bonusTarget || data.bonus.some((b) => b.plus || b.minus);

  return (
    <div className="grid gap-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="site-card overflow-x-auto">
        <table ref={tableRef} className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs">
            <tr>
              <th className="w-10 px-2 py-2 text-left">STT</th>
              <th className="min-w-[180px] px-2 py-2 text-left">Họ và tên</th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`px-1 py-2 ${c.kind === "nx" ? "min-w-[200px] text-left" : "w-16 text-center"} ${c.key === data.book.bonusTarget ? "bg-amber-100" : ""}`}
                  title={c.key === data.book.bonusTarget ? "Cột nhận điểm cộng/trừ" : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-14 px-1 py-2 text-center text-emerald-700">Cộng</th>
              <th className="w-14 px-1 py-2 text-center text-red-700">Trừ</th>
              <th className="w-16 px-1 py-2 text-center">ĐTB</th>
              <th
                className="w-20 px-1 py-2 text-center"
                title="Ghi nhận trong học kỳ (tích cực / chưa tốt)"
              >
                Ghi nhận
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((s, ri) => {
              const values = raw.get(s.id) ?? {};
              const b = bonus.get(s.id);
              const eff = effectiveValues(cols, values, b, data.book.bonusTarget);
              const avg = termAverage(cols, eff);
              const ct = countsText(data.counts[s.id]);
              return (
                <tr
                  key={s.id}
                  className={isActive(s.status) ? "" : "text-muted-foreground opacity-70"}
                >
                  <td className="px-2 py-1">{ri + 1}</td>
                  <td className="px-2 py-1 font-medium">
                    {s.fullName}
                    {!isActive(s.status) ? (
                      <span className="ml-1 text-xs">({STATUS_LABEL[s.status]})</span>
                    ) : null}
                  </td>
                  {cols.map((c, ci) => (
                    <td
                      key={c.key}
                      className={`px-0.5 py-0.5 ${c.key === data.book.bonusTarget ? "bg-amber-50" : ""}`}
                    >
                      <Cell
                        col={c}
                        id={`${ri}:${ci}`}
                        initial={
                          isNumeric(c) ? formatScore(values[c.key]) : (txt.get(s.id)?.[c.key] ?? "")
                        }
                        effective={
                          c.key === data.book.bonusTarget && eff[c.key] !== (values[c.key] ?? null)
                            ? eff[c.key]
                            : undefined
                        }
                        label={`${c.label} – ${s.fullName}`}
                        onCommit={(t) => commit(s.id, c, t)}
                        onMove={(dr, dc) => focusCell(ri + dr, ci + dc)}
                      />
                    </td>
                  ))}
                  <td className="px-0.5 text-center">
                    <button
                      type="button"
                      className="w-full rounded px-1 py-1 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => onBonus(s)}
                      aria-label={`Điểm cộng – ${s.fullName}`}
                    >
                      {b?.plus ? (
                        `+${formatScore(b.plus)}`
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </button>
                  </td>
                  <td className="px-0.5 text-center">
                    <button
                      type="button"
                      className="w-full rounded px-1 py-1 text-red-700 hover:bg-red-50"
                      onClick={() => onBonus(s)}
                      aria-label={`Điểm trừ – ${s.fullName}`}
                    >
                      {b?.minus ? (
                        `−${formatScore(b.minus)}`
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </button>
                  </td>
                  <td
                    className={`px-1 text-center font-semibold ${avg.average !== null && avg.average < 5 ? scoreClass(avg.average) : avg.complete ? "" : "text-muted-foreground"}`}
                    title={
                      avg.average !== null && !avg.complete
                        ? "Chưa đủ cột điểm – SMAS chỉ tính khi đủ các cột"
                        : undefined
                    }
                  >
                    {avg.average === null
                      ? ""
                      : `${formatScore(avg.average)}${avg.complete ? "" : "*"}`}
                  </td>
                  <td className="px-1 text-center text-xs" title={ct.title}>
                    {ct.good || ct.bad ? (
                      <>
                        <span className="text-emerald-700">{ct.good}</span>
                        {" / "}
                        <span className="text-red-700">{ct.bad}</span>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Gõ điểm rồi Enter để xuống dòng, Tab để sang cột. Điểm lưu ngay từng ô. ĐTB có dấu * là chưa
        đủ cột.
        {hasBonus
          ? " Cột tô vàng nhận điểm cộng/trừ (số nhỏ bên dưới là điểm sau khi cộng/trừ)."
          : ""}
      </p>
    </div>
  );
}

function Cell({
  col,
  id,
  initial,
  effective,
  label,
  onCommit,
  onMove,
}: {
  col: BookColumn;
  id: string;
  initial: string;
  effective: number | null | undefined;
  label: string;
  onCommit: (text: string) => Promise<boolean>;
  onMove: (dr: number, dc: number) => void;
}) {
  const [text, setText] = useState(initial);
  const [bad, setBad] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(initial), [initial]);

  async function done() {
    if (text === initial) return;
    if (isNumeric(col) && parseScore(text) === "invalid") {
      setBad(true);
      return;
    }
    setSaving(true);
    const ok = await onCommit(text);
    setSaving(false);
    setBad(!ok);
  }

  const typed = isNumeric(col) ? parseScore(text) : null;
  const tone = typeof typed === "number" ? scoreClass(typed) : "";

  if (col.kind === "dg")
    return (
      <select
        data-cell={id}
        aria-label={label}
        className="h-8 w-full rounded border bg-background text-center"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          void onCommit(e.target.value);
        }}
      >
        <option value="" />
        <option value="Đ">Đ</option>
        <option value="CĐ">CĐ</option>
      </select>
    );

  return (
    <div className="relative">
      <input
        data-cell={id}
        aria-label={label}
        inputMode={isNumeric(col) ? "decimal" : "text"}
        maxLength={isNumeric(col) ? 5 : 255}
        className={`h-8 w-full rounded border px-1 ${isNumeric(col) ? "text-center" : ""} ${bad ? "border-red-500 bg-red-50" : "border-transparent hover:border-border focus:border-primary"} ${bad ? "" : tone} ${saving ? "opacity-60" : ""}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
        }}
        onBlur={() => void done()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void done();
            onMove(e.shiftKey ? -1 : 1, 0);
          } else if (e.key === "Escape") {
            setText(initial);
            setBad(false);
          } else if (isNumeric(col) && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            void done();
            onMove(e.key === "ArrowDown" ? 1 : -1, 0);
          }
        }}
      />
      {effective !== undefined && effective !== null ? (
        <span className="pointer-events-none absolute -bottom-1 right-0.5 text-[10px] font-semibold text-amber-700">
          {formatScore(effective)}
        </span>
      ) : null}
    </div>
  );
}
