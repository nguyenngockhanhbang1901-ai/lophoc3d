// Teacher-side server functions for assignments: give a matrix to a class with a time window,
// edit or remove it, and read the results. The matrix is copied into the assignment, so later
// edits to the matrix never change an exam that is already given.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assignmentSettingsSchema,
  chosenScore,
  readSettings,
  windowState,
  type AttemptStatus,
  type WindowState,
} from "./assignment";
import { retakeState } from "./anticheat";
import { analyzeMatrix, matrixSlotsSchema, type MatrixSlot } from "./matrix";

const uuid = z.string().uuid();

export interface AssignmentSummary {
  id: string;
  classId: string;
  className: string;
  matrixId: string | null;
  title: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  maxAttempts: number;
  questionCount: number;
  settings: z.infer<typeof assignmentSettingsSchema>;
  state: WindowState;
  studentCount: number;
  startedCount: number;
  finishedCount: number;
  /** attempts exist: matrix and duration can no longer change */
  locked: boolean;
}

export const listAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ serverNow: string; assignments: AssignmentSummary[] }> => {
      const { examDb } = await import("./db.server");
      const db = examDb();
      const { data, error } = await db
        .from("exam_assignments")
        .select(
          "id,class_id,matrix_id,title,opens_at,closes_at,duration_minutes,max_attempts,settings,slots",
        )
        .eq("owner_id", context.userId)
        .order("opens_at", { ascending: false });
      if (error)
        throw new Error(
          "Không đọc được danh sách bài giao. Bảng dữ liệu giao bài đã được tạo chưa?",
        );
      const rows = (data ?? []) as {
        id: string;
        class_id: string;
        matrix_id: string | null;
        title: string;
        opens_at: string;
        closes_at: string;
        duration_minutes: number;
        max_attempts: number;
        settings: unknown;
        slots: unknown[];
      }[];
      const now = Date.now();
      const classIds = [...new Set(rows.map((r) => r.class_id))];
      const [{ data: classes }, { data: students }, { data: attempts }] = await Promise.all([
        classIds.length
          ? db.from("exam_classes").select("id,name").in("id", classIds)
          : Promise.resolve({ data: [] }),
        classIds.length
          ? db.from("exam_students").select("class_id").in("class_id", classIds)
          : Promise.resolve({ data: [] }),
        rows.length
          ? db
              .from("exam_attempts")
              .select("assignment_id,student_id,status")
              .in(
                "assignment_id",
                rows.map((r) => r.id),
              )
          : Promise.resolve({ data: [] }),
      ]);
      const className = new Map(
        ((classes ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
      );
      const perClass = new Map<string, number>();
      for (const s of (students ?? []) as { class_id: string }[])
        perClass.set(s.class_id, (perClass.get(s.class_id) ?? 0) + 1);
      const started = new Map<string, Set<string>>();
      const finished = new Map<string, Set<string>>();
      for (const a of (attempts ?? []) as {
        assignment_id: string;
        student_id: string;
        status: AttemptStatus;
      }[]) {
        if (!started.has(a.assignment_id)) started.set(a.assignment_id, new Set());
        started.get(a.assignment_id)!.add(a.student_id);
        if (a.status !== "in_progress") {
          if (!finished.has(a.assignment_id)) finished.set(a.assignment_id, new Set());
          finished.get(a.assignment_id)!.add(a.student_id);
        }
      }
      return {
        serverNow: new Date(now).toISOString(),
        assignments: rows.map((r) => ({
          id: r.id,
          classId: r.class_id,
          className: className.get(r.class_id) ?? "",
          matrixId: r.matrix_id,
          title: r.title,
          opensAt: r.opens_at,
          closesAt: r.closes_at,
          durationMinutes: r.duration_minutes,
          maxAttempts: r.max_attempts,
          questionCount: Array.isArray(r.slots) ? r.slots.length : 0,
          settings: readSettings(r.settings),
          state: windowState(r.opens_at, r.closes_at, now),
          studentCount: perClass.get(r.class_id) ?? 0,
          startedCount: started.get(r.id)?.size ?? 0,
          finishedCount: finished.get(r.id)?.size ?? 0,
          locked: (started.get(r.id)?.size ?? 0) > 0,
        })),
      };
    },
  );

export const saveAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: uuid.optional(),
      classId: uuid,
      matrixId: uuid,
      title: z.string().trim().min(1).max(150),
      opensAt: z.string().datetime({ offset: true }),
      closesAt: z.string().datetime({ offset: true }),
      durationMinutes: z.number().int().min(1).max(300),
      maxAttempts: z.number().int().min(1).max(20),
      settings: assignmentSettingsSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass } = await import("./db.server");
    const { POOL_COLUMNS, toPool } = await import("./pool");
    const db = examDb();
    await ownedClass(context.userId, data.classId);
    if (new Date(data.closesAt) <= new Date(data.opensAt))
      throw new Error("Giờ đóng phải sau giờ mở");

    const { data: matrix } = await db
      .from("exam_matrices")
      .select("id,slots,shuffle_options,shuffle_order")
      .eq("id", data.matrixId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!matrix) throw new Error("Không tìm thấy ma trận đề");
    const slots = matrixSlotsSchema.parse((matrix as { slots: unknown }).slots) as MatrixSlot[];
    const bankIds = [...new Set(slots.map((s) => s.bankId))];
    const [{ data: qRows }, { data: bankRows }] = await Promise.all([
      db
        .from("exam_questions")
        .select(POOL_COLUMNS)
        .eq("owner_id", context.userId)
        .in("bank_id", bankIds),
      db.from("exam_banks").select("id,title").eq("owner_id", context.userId).in("id", bankIds),
    ]);
    const analysis = analyzeMatrix(
      slots,
      toPool((qRows ?? []) as never),
      (bankRows ?? []) as { id: string; title: string }[],
      data.settings.scale,
    );
    const blocking = analysis.problems.find((p) => p.severity === "error");
    if (blocking) throw new Error(`Ma trận chưa dùng được: ${blocking.message}`);

    const common = {
      title: data.title,
      opens_at: data.opensAt,
      closes_at: data.closesAt,
      max_attempts: data.maxAttempts,
      settings: data.settings,
      updated_at: new Date().toISOString(),
    };
    const exam = {
      matrix_id: data.matrixId,
      slots,
      shuffle_options: (matrix as { shuffle_options: boolean }).shuffle_options,
      shuffle_order: (matrix as { shuffle_order: boolean }).shuffle_order,
      duration_minutes: data.durationMinutes,
    };
    if (data.id) {
      const { data: current } = await db
        .from("exam_assignments")
        .select("id,class_id,matrix_id,duration_minutes")
        .eq("id", data.id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (!current) throw new Error("Không tìm thấy bài giao");
      const { count } = await db
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", data.id);
      const started = (count ?? 0) > 0;
      const c = current as { class_id: string; matrix_id: string | null; duration_minutes: number };
      if (
        started &&
        (c.class_id !== data.classId ||
          c.matrix_id !== data.matrixId ||
          c.duration_minutes !== data.durationMinutes)
      )
        throw new Error(
          "Đã có học sinh làm bài: không đổi được lớp, ma trận hay thời lượng. Hãy giao một bài mới.",
        );
      const { error } = await db
        .from("exam_assignments")
        .update(started ? common : { ...common, ...exam, class_id: data.classId })
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (error) throw new Error("Không lưu được bài giao");
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("exam_assignments")
      .insert({ ...common, ...exam, class_id: data.classId, owner_id: context.userId })
      .select("id,title,class_id,owner_id,opens_at,closes_at")
      .single();
    if (error || !row) throw new Error("Không giao được bài");
    const { notifyNewAssignment } = await import("./retakes.server");
    // a failed notice must not undo the assignment
    await notifyNewAssignment(
      row as {
        id: string;
        title: string;
        class_id: string;
        owner_id: string;
        opens_at: string;
        closes_at: string;
      },
    ).catch(() => undefined);
    return { id: (row as { id: string }).id };
  });

export const deleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { examDb } = await import("./db.server");
    const { error } = await examDb()
      .from("exam_assignments")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Không xóa được bài giao");
    return { ok: true };
  });

export interface StudentResult {
  studentId: string;
  fullName: string;
  username: string;
  /** the attempt whose score counts (per the assignment's rule), or null */
  score: number | null;
  /** why the student cannot start again without the teacher, or null */
  waiting: string | null;
  /** an unused permission to retake */
  grant: { id: string; reason: string; expiresAt: string | null } | null;
  /** permissions given so far (revoked ones excluded) */
  grantCount: number;
  attempts: {
    id: string;
    attemptNo: number;
    status: AttemptStatus;
    code: string;
    startedAt: string;
    finishedAt: string | null;
    score: number | null;
    correctCount: number | null;
    questionCount: number;
    counts: boolean;
    violationCount: number;
    disconnectCount: number;
    editCount: number;
  }[];
}

export const assignmentResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ assignmentId: uuid }))
  .handler(async ({ data, context }): Promise<{ serverNow: string; students: StudentResult[] }> => {
    const { examDb } = await import("./db.server");
    const { finishIfExpired } = await import("./attempt.server");
    const db = examDb();
    const { data: a } = await db
      .from("exam_assignments")
      .select("id,class_id,settings,opens_at,closes_at,max_attempts")
      .eq("id", data.assignmentId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!a) throw new Error("Không tìm thấy bài giao");
    const assignment = a as {
      id: string;
      class_id: string;
      settings: unknown;
      opens_at: string;
      closes_at: string;
      max_attempts: number;
    };
    const { grantsByStudent } = await import("./retakes.server");
    const grants = await grantsByStudent(assignment.id);
    const window = windowState(assignment.opens_at, assignment.closes_at, Date.now());
    const settings = readSettings(assignment.settings);
    const [{ data: students }, { data: attempts }] = await Promise.all([
      db
        .from("exam_students")
        .select("id,full_name,username")
        .eq("class_id", assignment.class_id)
        .order("created_at")
        .order("full_name"),
      db
        .from("exam_attempts")
        .select(
          "id,student_id,attempt_no,status,code,started_at,deadline_at,finished_at,score,correct_count,items,counts_toward_attempts,violation_count,disconnect_count,edit_count",
        )
        .eq("assignment_id", assignment.id)
        .order("attempt_no"),
    ]);
    type Row = {
      id: string;
      student_id: string;
      attempt_no: number;
      status: AttemptStatus;
      code: string;
      started_at: string;
      deadline_at: string;
      finished_at: string | null;
      score: number | null;
      correct_count: number | null;
      items: unknown[];
      counts_toward_attempts: boolean;
      violation_count: number | null;
      disconnect_count: number | null;
      edit_count: number | null;
    };
    const rows = (attempts ?? []) as Row[];
    // papers whose time ran out are collected now, so the table never shows a stale "đang làm"
    for (const r of rows) {
      if (r.status === "in_progress" && new Date(r.deadline_at).getTime() < Date.now()) {
        const done = await finishIfExpired(r.id);
        if (done) Object.assign(r, done);
      }
    }
    const byStudent = new Map<string, Row[]>();
    for (const r of rows) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r]);
    return {
      serverNow: new Date().toISOString(),
      students: ((students ?? []) as { id: string; full_name: string; username: string }[]).map(
        (s) => {
          const list = byStudent.get(s.id) ?? [];
          const chosen = chosenScore(
            list.map((r) => ({
              ...r,
              score: r.score === null ? null : Number(r.score),
              counts: r.status !== "cancelled_network" && r.status !== "cancelled_edit",
            })),
            settings.scoreRule,
          );
          const g = grants.get(s.id);
          const retake = retakeState(list, assignment.max_attempts, settings.autoRetakes, window);
          return {
            studentId: s.id,
            fullName: s.full_name,
            username: s.username,
            score: chosen?.score ?? null,
            waiting: list.some((r) => r.status === "in_progress")
              ? null
              : retake.kind === "wait_teacher"
                ? retake.reason
                : retake.kind === "closed"
                  ? "Bài đã đóng, chưa làm"
                  : null,
            grant: g?.active
              ? { id: g.active.id, reason: g.active.reason, expiresAt: g.active.expires_at }
              : null,
            grantCount: g?.total ?? 0,
            attempts: list.map((r) => ({
              id: r.id,
              attemptNo: r.attempt_no,
              status: r.status,
              code: r.code,
              startedAt: r.started_at,
              finishedAt: r.finished_at,
              score: r.score === null ? null : Number(r.score),
              correctCount: r.correct_count,
              questionCount: Array.isArray(r.items) ? r.items.length : 0,
              counts: r.counts_toward_attempts,
              violationCount: r.violation_count ?? 0,
              disconnectCount: r.disconnect_count ?? 0,
              editCount: r.edit_count ?? 0,
            })),
          };
        },
      ),
    };
  });

export const grantRetake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      assignmentId: uuid,
      studentIds: z.array(uuid).min(1).max(200),
      reason: z.string().max(300),
      expiresAt: z.string().datetime({ offset: true }).nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { grantRetakes } = await import("./retakes.server");
    return grantRetakes(
      context.userId,
      data.assignmentId,
      data.studentIds,
      data.reason,
      data.expiresAt,
    );
  });

export const revokeRetake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ grantId: uuid }))
  .handler(async ({ data, context }) => {
    const { revokeGrant } = await import("./retakes.server");
    return revokeGrant(context.userId, data.grantId);
  });
