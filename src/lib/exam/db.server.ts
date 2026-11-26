// Server-only access to the exam tables. The generated Database types do not list these
// tables until Lovable applies docs/thi-online/*.sql and regenerates types.ts, so this
// module exposes an untyped admin client together with hand-written row shapes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hashToken } from "./secrets";

export interface ExamClassRow {
  id: string;
  owner_id: string;
  name: string;
  school_year: string;
  subject: string;
  archived: boolean;
  created_at: string;
}

export interface ExamStudentRow {
  id: string;
  class_id: string;
  owner_id: string;
  full_name: string;
  birth_date: string | null;
  student_code: string | null;
  username: string;
  password_hash: string;
  locked: boolean;
  password_set_at: string;
  created_at: string;
}

export const STUDENT_PUBLIC_COLUMNS =
  "id,class_id,full_name,birth_date,student_code,username,locked,password_set_at,created_at";

export function examDb(): SupabaseClient {
  return supabaseAdmin as unknown as SupabaseClient;
}

export function requestUserAgent(): string {
  return (getRequest()?.headers.get("user-agent") ?? "").slice(0, 300);
}

/** The class if the signed-in teacher owns it; throws otherwise. */
export async function ownedClass(ownerId: string, classId: string): Promise<ExamClassRow> {
  const { data, error } = await examDb()
    .from("exam_classes")
    .select("*")
    .eq("id", classId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error("Không đọc được lớp học");
  if (!data) throw new Error("Không tìm thấy lớp học");
  return data as ExamClassRow;
}

/** Ids that really belong to this class (and so to this teacher). */
export async function studentsInClass(classId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data, error } = await examDb()
    .from("exam_students")
    .select("id")
    .eq("class_id", classId)
    .in("id", ids);
  if (error) throw new Error("Không đọc được danh sách học sinh");
  return (data ?? []).map((r: { id: string }) => r.id);
}

export interface StudentSession {
  tokenHash: string;
  student: ExamStudentRow;
}

/** Student behind a session token, or an error the page turns into "please sign in again". */
export async function sessionStudent(token: string): Promise<StudentSession> {
  const tokenHash = await hashToken(token);
  const db = examDb();
  const { data: session } = await db
    .from("exam_student_sessions")
    .select("student_id,expires_at,last_seen_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!session || new Date(session.expires_at as string).getTime() < Date.now())
    throw new Error("SESSION_EXPIRED");
  const { data: student } = await db
    .from("exam_students")
    .select("*")
    .eq("id", session.student_id)
    .maybeSingle();
  if (!student) throw new Error("SESSION_EXPIRED");
  if ((student as ExamStudentRow).locked) {
    await db
      .from("exam_student_sessions")
      .delete()
      .eq("student_id", (student as ExamStudentRow).id);
    throw new Error("ACCOUNT_LOCKED");
  }
  // Refresh at most once a minute to keep writes low.
  if (Date.now() - new Date(session.last_seen_at as string).getTime() > 60_000) {
    await db
      .from("exam_student_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("token_hash", tokenHash);
  }
  return { tokenHash, student: student as ExamStudentRow };
}
