import { z } from 'zod';
export const lessonModeSchema = z.enum(['default', 'lecture', 'presentation']);
export type LessonMode = z.infer<typeof lessonModeSchema>;
export function canReadLecture(mode: string, closed: boolean) { return mode === 'lecture' && !closed; }
export function needsAssignmentStart(activity: number) { return activity === 1 || activity === 3 || activity === 6; }
export const presentationStateSchema = z.object({ roomId: z.string().uuid(), activity: z.number().int().min(1).max(6), step: z.number().int().min(0).max(100), review: z.boolean() });