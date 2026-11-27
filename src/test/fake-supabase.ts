// A small in-memory stand-in for the parts of the Supabase query builder the exam server code
// uses, so the attempt flow (start → answer → submit → grade) can be tested without a database.
type Row = Record<string, unknown>;

interface Unique {
  table: string;
  columns: string[];
  /** only rows matching this take part (partial unique index) */
  where?: (row: Row) => boolean;
}

function pick(row: Row, columns: string): Row {
  if (columns.trim() === "*" || !columns.trim()) return { ...row };
  const out: Row = {};
  for (const part of columns.split(",").map((c) => c.trim())) {
    const alias = part.includes(":") ? part.split(":")[0]! : null;
    const expr = part.includes(":") ? part.split(":")[1]! : part;
    const json = /^(\w+)->>?(\w+)$/.exec(expr);
    if (json) {
      const base = row[json[1]!] as Row | undefined;
      out[alias ?? json[2]!] = base ? (base[json[2]!] ?? null) : null;
    } else out[alias ?? expr] = row[expr] ?? null;
  }
  return out;
}

export class FakeDb {
  tables = new Map<string, Row[]>();
  uniques: Unique[] = [];
  private seq = 0;

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }
  id(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
  }
  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<{
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
}> {
  private filters: ((r: Row) => boolean)[] = [];
  private columns = "*";
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private returning = false;
  private singleMode: "one" | "maybe" | null = null;
  private countOnly = false;
  private orders: [string, boolean][] = [];
  private max: number | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    if (this.mode === "select") this.columns = columns;
    else {
      this.returning = true;
      this.columns = columns;
    }
    if (opts?.head) this.countOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = rows;
    return this;
  }
  update(values: Row) {
    this.mode = "update";
    this.payload = values;
    return this;
  }
  upsert(row: Row) {
    this.mode = "upsert";
    this.payload = row;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  is(c: string, v: null) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  in(c: string, v: unknown[]) {
    this.filters.push((r) => v.includes(r[c]));
    return this;
  }
  lt(c: string, v: string) {
    this.filters.push((r) => String(r[c]) < v);
    return this;
  }
  gte(c: string, v: string) {
    this.filters.push((r) => String(r[c]) >= v);
    return this;
  }
  order(c: string, opts?: { ascending?: boolean }) {
    this.orders.push([c, opts?.ascending !== false]);
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }

  private violates(row: Row, ignore?: Row): boolean {
    return this.db.uniques.some(
      (u) =>
        u.table === this.table &&
        (!u.where || u.where(row)) &&
        this.db
          .rows(this.table)
          .some(
            (other) =>
              other !== ignore &&
              (!u.where || u.where(other)) &&
              u.columns.every((c) => other[c] === row[c]),
          ),
    );
  }

  private run() {
    const all = this.db.rows(this.table);
    const match = () => all.filter((r) => this.filters.every((f) => f(r)));
    let out: Row[] = [];
    if (this.mode === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const created: Row[] = [];
      for (const p of list) {
        const row: Row = {
          id: this.db.id(),
          created_at: new Date().toISOString(),
          status: this.table === "exam_attempts" ? "in_progress" : undefined,
          reached_index: 0,
          completed_all_at: null,
          finished_at: null,
          score: null,
          correct_count: null,
          counts_toward_attempts: true,
          violation_count: 0,
          disconnect_count: 0,
          edit_count: 0,
          edit_warned_at: null,
          last_heartbeat_at: null,
          session_hash: null,
          ...p,
        };
        if (this.violates(row))
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        created.push(row);
      }
      all.push(...created);
      out = created;
    } else if (this.mode === "update") {
      out = match();
      for (const r of out) Object.assign(r, this.payload);
    } else if (this.mode === "upsert") {
      const p = this.payload as Row;
      const key = Object.keys(p).filter((k) => k === "attempt_id" || k === "item_index");
      const existing = all.find((r) => key.every((k) => r[k] === p[k]));
      if (existing) Object.assign(existing, p);
      else all.push({ ...p });
      out = [p];
    } else if (this.mode === "delete") {
      out = match();
      this.db.tables.set(
        this.table,
        all.filter((r) => !out.includes(r)),
      );
    } else out = match();
    for (const [c, asc] of [...this.orders].reverse())
      out = [...out].sort((a, b) => (a[c]! < b[c]! ? -1 : a[c]! > b[c]! ? 1 : 0) * (asc ? 1 : -1));
    if (this.max !== null) out = out.slice(0, this.max);
    if (this.countOnly) return { data: null, error: null, count: out.length };
    if (this.mode !== "select" && !this.returning && this.singleMode === null)
      return { data: null, error: null };
    const data = out.map((r) => pick(r, this.columns));
    if (this.singleMode === "maybe") return { data: data[0] ?? null, error: null };
    if (this.singleMode === "one")
      return data[0]
        ? { data: data[0], error: null }
        : { data: null, error: { message: "no rows" } };
    return { data, error: null };
  }

  then<A, B>(
    ok?: ((v: ReturnType<Query["run"]>) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, fail);
  }
}
