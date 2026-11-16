/** Classroom names use the teacher's lesson and Vietnam's local date/time. */
export function defaultClassroomTitle(lessonTitle: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${lessonTitle} - ${value('day')}/${value('month')}/${value('year')} - ${value('hour')}:${value('minute')} ${value('dayPeriod').toLowerCase()}`;
}