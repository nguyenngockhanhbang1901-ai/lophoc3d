// Turning stored question rows (without pictures) into the usable pool a matrix draws from.
import type { PoolQuestion } from "./matrix";
import {
  questionDataSchema,
  questionGaps,
  type QuestionKind,
  type QuestionLevel,
} from "./questions";

export const POOL_COLUMNS =
  "id,bank_id,kind,level,position,hidden,stem:body->>stem,data:body->data";

export interface PoolRow {
  id: string;
  bank_id: string;
  kind: QuestionKind;
  level: QuestionLevel;
  position: number;
  hidden: boolean;
  stem: string | null;
  data: unknown;
}

/** Questions that can go into an exam: not hidden and nothing missing. */
export function toPool(rows: PoolRow[]): PoolQuestion[] {
  const out: PoolQuestion[] = [];
  for (const q of rows) {
    if (q.hidden) continue;
    const parsed = questionDataSchema.safeParse(q.data);
    if (!parsed.success) continue;
    if (
      questionGaps({ stem: q.stem ?? "", media: null, explanation: "", data: parsed.data }).length
    )
      continue;
    out.push({ id: q.id, bankId: q.bank_id, kind: q.kind, level: q.level, position: q.position });
  }
  return out;
}
