import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { classroomCodeSchema, codeJoinKey } from './classroom-access';
import { cubeSubmission, CUBE_LESSON_KEY, MAX_CUBE_STUDENTS, scheduledReleaseError } from './cube-practice';
import { assignmentStarted } from './assignment';
const credential = classroomCodeSchema.extend({ slot:z.number().int().min(1).max(MAX_CUBE_STUDENTS), key:z.string().length(24) });
export type CubeAccess = z.infer<typeof credential>;
async function verify(data: CubeAccess) {
 const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
 const {data:room}=await supabaseAdmin.from('classrooms').select('id,closed,started_at,lesson_key,lesson_title').eq('code',data.code).maybeSingle();
 if (!room || room.lesson_key!==CUBE_LESSON_KEY) throw new Error('Mã lớp không đúng');
 const {data:student}=await supabaseAdmin.from('lesson111_students').select().eq('classroom_id',room.id).eq('slot',data.slot).maybeSingle();
 if (!student?.name || data.key!==await codeJoinKey(room.id,student.access_hash)) throw new Error('Thông tin tham gia không hợp lệ');
 return {supabaseAdmin,room,student};
}
export const joinCubeClassroom=createServerFn({method:'POST'}).inputValidator(classroomCodeSchema.extend({name:z.string().trim().min(2).max(100)})).handler(async({data})=>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data:room}=await supabaseAdmin.from('classrooms').select('id,closed,lesson_key,lesson_title').eq('code',data.code).maybeSingle();
 if (!room || room.closed || room.lesson_key!==CUBE_LESSON_KEY) throw new Error('Mã lớp không đúng hoặc lớp đã đóng');
 // Like code-only team entry, the same name in this class resumes that student's own saved work.
 const sameName=(value:string|null)=>Boolean(value && value.trim().toLocaleLowerCase('vi')===data.name.toLocaleLowerCase('vi'));
 const {data:claimedRows}=await supabaseAdmin.from('lesson111_students').select('slot,name,access_hash').eq('classroom_id',room.id).not('name','is',null);
 const existing=(claimedRows ?? []).find(row=>sameName(row.name));
 if (existing) return {code:data.code,slot:existing.slot,key:await codeJoinKey(room.id,existing.access_hash),title:room.lesson_title};
 for (let attempt=0;attempt<MAX_CUBE_STUDENTS;attempt++) {
  const {data:slot}=await supabaseAdmin.from('lesson111_students').select('id,slot,access_hash').eq('classroom_id',room.id).is('name',null).order('slot').limit(1).maybeSingle();
  if (!slot) throw new Error('Lớp đã đủ 45 học sinh');
  const {data:claimed,error}=await supabaseAdmin.from('lesson111_students').update({name:data.name}).eq('id',slot.id).is('name',null).select('id').maybeSingle();
  if (error) {
   const {data:latest}=await supabaseAdmin.from('lesson111_students').select('slot,name,access_hash').eq('classroom_id',room.id).not('name','is',null);
   const joined=(latest ?? []).find(row=>sameName(row.name));
   if (joined) return {code:data.code,slot:joined.slot,key:await codeJoinKey(room.id,joined.access_hash),title:room.lesson_title};
   throw new Error('Không vào được lớp, hãy thử lại');
  }
  if (claimed) return {code:data.code,slot:slot.slot,key:await codeJoinKey(room.id,slot.access_hash),title:room.lesson_title};
 }
 throw new Error('Đang có nhiều học sinh tham gia, hãy thử lại');
});
export const readCubeStudent=createServerFn({method:'POST'}).inputValidator(credential).handler(async({data})=>{
 const {room,student}=await verify(data);
 const now=Date.now(),released=assignmentStarted(room.started_at,now);
 // Before release only the waiting screen is shown, so no answers are returned.
 return {name:student.name,answers:released?student.answers as string[]:[],submitted_at:student.submitted_at,released,release_at:room.started_at,serverNow:now,closed:room.closed};
});
export const submitCubeAnswers=createServerFn({method:'POST'}).inputValidator(credential.extend({answers:z.array(z.string().max(2000)).length(6)})).handler(async({data})=>{
 const {supabaseAdmin,room,student}=await verify(data);
 if(room.closed || !assignmentStarted(room.started_at,Date.now())) throw new Error('Chờ giáo viên giao bài hoặc mở lại lớp');
 const next=cubeSubmission(data.answers,student.submitted_at,Date.now());
 const {data:saved,error}=await supabaseAdmin.from('lesson111_students').update(next).eq('id',student.id).is('submitted_at',null).select('submitted_at').maybeSingle();
 if(error || !saved) throw new Error('Bài đã nộp · Không thể sửa');
 return saved;
});
export const readCubeResults=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({roomId:z.string().uuid()})).handler(async({data,context})=>{
 const {data:room}=await context.supabase.from('classrooms').select('id,lesson_key').eq('id',data.roomId).eq('owner_id',context.userId).maybeSingle();
 if(!room || room.lesson_key!==CUBE_LESSON_KEY) throw new Error('Không có quyền xem lớp');
 const {data:rows,error}=await context.supabase.from('lesson111_students').select('slot,name,answers,submitted_at').eq('classroom_id',room.id).not('name','is',null).order('slot');
 if(error) throw new Error('Không đọc được bài làm');
 return rows ?? [];
});// A scheduled release stores the future moment as the part's start, so the server opens the work exactly then without a timer job.
export const scheduleCubeRelease=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({roomId:z.string().uuid(),at:z.string().datetime({offset:true}).nullable()})).handler(async({data,context})=>{
 const {data:room}=await context.supabase.from('classrooms').select('id,lesson_key,started_at').eq('id',data.roomId).eq('owner_id',context.userId).maybeSingle();
 if(!room || room.lesson_key!==CUBE_LESSON_KEY) throw new Error('Không có quyền với lớp này');
 const now=Date.now();
 if(assignmentStarted(room.started_at,now)) throw new Error('Bài đã được giao');
 if(data.at){const problem=scheduledReleaseError(data.at,now);if(problem) throw new Error(problem);}
 const startedAt=data.at?new Date(data.at).toISOString():null;
 const {data:saved,error}=await context.supabase.from('classrooms').update({started_at:startedAt,current_activity:1}).eq('id',room.id).eq('owner_id',context.userId).or(`started_at.is.null,started_at.gt.${new Date(now).toISOString()}`).select('started_at').maybeSingle();
 if(error || !saved) throw new Error('Không hẹn được giờ giao bài');
 return {startedAt:saved.started_at};
});
