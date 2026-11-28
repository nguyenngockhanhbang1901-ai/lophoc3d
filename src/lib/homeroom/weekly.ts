// Pure weekly competition score (điểm thi đua tuần): every student starts the week at a base,
// in-class records, attendance and incidents add or subtract, and the total maps to a level.
import { z } from "zod";
import type { AbsenceRecord } from "./attendance";
import type { BehaviorKind } from "@/lib/gradebook/scores";
import type { Level } from "./evaluation";

export const weeklyRuleSchema = z.object({
  start: z.number().int().min(0).max(1000),
  phat_bieu: z.number().int().min(-50).max(50),
  phat_bieu_cap: z.number().int().min(0).max(200),
  len_bang: z.number().int().min(-50).max(50),
  lam_tot: z.number().int().min(-50).max(50),
  khong_lam_bai: z.number().int().min(-50).max(50),
  khong_chuan_bi: z.number().int().min(-50).max(50),
  mat_trat_tu: z.number().int().min(-50).max(50),
  di_muon: z.number().int().min(-50).max(50),
  co_phep: z.number().int().min(-50).max(50),
  khong_phep: z.number().int().min(-50).max(50),
  tot: z.number().int().min(0).max(1000),
  kha: z.number().int().min(0).max(1000),
  dat: z.number().int().min(0).max(1000),
});
export type WeeklyRule = z.infer<typeof weeklyRuleSchema>;

export const DEFAULT_WEEKLY_RULE: WeeklyRule = {
  start: 100,
  phat_bieu: 2,
  phat_bieu_cap: 10,
  len_bang: 2,
  lam_tot: 5,
  khong_lam_bai: -3,
  khong_chuan_bi: -3,
  mat_trat_tu: -3,
  di_muon: -2,
  co_phep: 0,
  khong_phep: -10,
  tot: 100,
  kha: 90,
  dat: 75,
};

export const DEFAULT_INCIDENT_POINTS = { khen: 5, vi_pham: -5 } as const;

export interface WeekLine {
  label: string;
  count: number;
  points: number;
}

export interface WeekScore {
  points: number;
  level: Level;
  lines: WeekLine[];
}

const BEHAVIOR_LINE: Record<BehaviorKind, string> = {
  phat_bieu: "Phát biểu",
  len_bang: "Lên bảng",
  lam_tot: "Làm tốt nhiệm vụ",
  khong_lam_bai: "Không làm bài tập",
  khong_chuan_bi: "Không chuẩn bị bài",
  mat_trat_tu: "Mất trật tự",
};

export function levelFor(points: number, rule: WeeklyRule): Level {
  if (points >= rule.tot) return "tot";
  if (points >= rule.kha) return "kha";
  if (points >= rule.dat) return "dat";
  return "chua_dat";
}

/** One student's week: behaviour taps, absences/late arrivals and incidents (already in the week). */
export function weekScore(
  behavior: BehaviorKind[],
  absences: Pick<AbsenceRecord, "kind">[],
  incidents: { type: "khen" | "vi_pham"; points: number; content: string }[],
  rule: WeeklyRule,
): WeekScore {
  const lines: WeekLine[] = [];
  const counts = new Map<BehaviorKind, number>();
  for (const k of behavior) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [k, n] of counts) {
    let pts = n * rule[k];
    if (k === "phat_bieu" && rule.phat_bieu_cap > 0 && pts > rule.phat_bieu_cap)
      pts = rule.phat_bieu_cap;
    lines.push({ label: BEHAVIOR_LINE[k], count: n, points: pts });
  }
  const abs = { co_phep: 0, khong_phep: 0, di_muon: 0 };
  for (const a of absences) abs[a.kind]++;
  if (abs.co_phep)
    lines.push({ label: "Nghỉ có phép", count: abs.co_phep, points: abs.co_phep * rule.co_phep });
  if (abs.khong_phep)
    lines.push({
      label: "Nghỉ không phép",
      count: abs.khong_phep,
      points: abs.khong_phep * rule.khong_phep,
    });
  if (abs.di_muon)
    lines.push({ label: "Đi muộn", count: abs.di_muon, points: abs.di_muon * rule.di_muon });
  for (const i of incidents)
    lines.push({
      label: `${i.type === "khen" ? "Khen" : "Vi phạm"}: ${i.content}`,
      count: 1,
      points: i.points,
    });
  const points = rule.start + lines.reduce((a, l) => a + l.points, 0);
  return { points, level: levelFor(points, rule), lines };
}
