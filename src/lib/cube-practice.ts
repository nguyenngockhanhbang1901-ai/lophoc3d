export const CUBE_LESSON_KEY = '11.1';
export const CUBE_LESSON_TITLE = 'Bài 11.1: Hai đường thẳng song song';
export const MAX_CUBE_STUDENTS = 45;
export type CubePoint = [number, number, number];
export const CUBE_VERTICES: Record<string, CubePoint> = {
 M: [-1,-1,1], N: [1,-1,1], P: [1,-1,-1], Q: [-1,-1,-1],
 "M'": [-1,1,1], "N'": [1,1,1], "P'": [1,1,-1], "Q'": [-1,1,-1],
};
export const CUBE_EDGES = [['M','N'],['N','P'],['P','Q'],['Q','M'],["M'","N'"],["N'","P'"],["P'","Q'"],["Q'","M'"],['M',"M'"],['N',"N'"],['P',"P'"],['Q',"Q'"]] as const;
// The diagonal plane in question 6 requires both diagonals to be drawn.
export const CUBE_LINES = [...CUBE_EDGES, ['N','Q'],["N'","Q'"]] as const;
export const CUBE_QUESTIONS = [
 'Tìm các đường thẳng song song với đường thẳng $MN$?',
 "Những đường thẳng nào trong mặt phẳng $(M'N'P'Q')$ song song với đường thẳng $PQ$?",
 "Đường thẳng $M'N'$ chéo với những đường thẳng nào?",
 "Đường thẳng $PQ$ chéo với đường thẳng nào trong mặt phẳng $(M'N'P'Q')$?",
 "Mặt phẳng $(MQQ'M')$ được xác định bởi hai đường thẳng song song nào?",
 "Mặt phẳng $(NQQ'N')$ được xác định bởi hai đường thẳng song song nào?",
];
export const CUBE_ANSWERS = [
 String.raw`$PQ,\ M'N',\ P'Q'$`,
 String.raw`$M'N',\ P'Q'$`,
 String.raw`$NP,\ MQ,\ PP',\ QQ',\ NQ$`,
 String.raw`$N'P',\ M'Q',\ N'Q'$`,
 String.raw`$MQ \ss M'Q'$ hoặc $MM' \ss QQ'$`,
 String.raw`$NQ \ss N'Q'$ hoặc $NN' \ss QQ'$`,
];
export function cubeSubmission(answers: string[], submittedAt: string | null, now: number) {
 if (submittedAt) throw new Error('Bài đã nộp · Không thể sửa');
 if (answers.length !== 6 || answers.some(a => !a.trim() || a.length > 2000)) throw new Error('Hãy trả lời đủ 6 câu');
 return { answers: answers.map(a => a.trim()), submitted_at: new Date(now).toISOString() };
}
export function submissionClock(iso: string | null) {
 return iso ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date(iso)) : 'Chưa nộp';
}
// A segment is hidden when its midpoint ray crosses the interior of the cube.
export function cubeLineHidden(a: CubePoint, b: CubePoint, camera: CubePoint) {
 const midpoint = a.map((v,i) => (v + (b[i] ?? 0))/2);
 let lo = 0, hi = 1;
 for (let i=0;i<3;i++) {
  const start = camera[i] ?? 0, direction = (midpoint[i] ?? 0)-start;
  if (Math.abs(direction)<1e-8) { if (Math.abs(start)>1-1e-6) return false; continue; }
  const t1=(-1+1e-6-start)/direction, t2=(1-1e-6-start)/direction;
  lo=Math.max(lo,Math.min(t1,t2)); hi=Math.min(hi,Math.max(t1,t2));
 }
 return hi > lo && lo < 1-1e-6;
}// Teacher results list the earliest submissions first; students who have not submitted follow in slot order.
export function cubeResultOrder<T extends { slot: number; submitted_at: string | null }>(rows: readonly T[]) {
 const time = (row: T) => row.submitted_at ? Date.parse(row.submitted_at) : Number.POSITIVE_INFINITY;
 return [...rows].sort((a, b) => time(a) - time(b) || a.slot - b.slot);
}
export const RELEASE_COUNTDOWN_SECONDS = 5;
const pad = (n: number) => String(n).padStart(2, '0');
/** Clock text for the time left before the opening: mm:ss, or h:mm:ss once past an hour. */
export function releaseCountdownClock(ms: number) {
 const s = Math.max(0, Math.ceil(ms / 1000));
 const h = Math.floor(s / 3600);
 return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
/** Before the release time students see only the waiting screen; the last five seconds show a countdown. */
export function releaseState(releaseAt: string | null | undefined, now: number): { released: boolean; countdown: number | null; remaining: string | null } {
 if (!releaseAt) return { released: false, countdown: null, remaining: null };
 const left = Date.parse(releaseAt) - now;
 if (left <= 0) return { released: true, countdown: null, remaining: null };
 return { released: false, countdown: left <= RELEASE_COUNTDOWN_SECONDS * 1000 ? Math.ceil(left / 1000) : null, remaining: releaseCountdownClock(left) };
}
/** A scheduled release must name a valid moment that is still ahead. */
export function scheduledReleaseError(at: string, now: number) {
 const time = Date.parse(at);
 if (!Number.isFinite(time)) return 'Giờ giao bài không hợp lệ';
 if (time <= now) return 'Hãy chọn thời điểm sau bây giờ';
 return null;
}
