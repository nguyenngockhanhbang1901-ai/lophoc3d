export const DEFAULT_LESSONS = [
  { lesson_key: '11', title: 'Bài 11: Hai đường thẳng song song', content: {} },
  { lesson_key: '11.1', title: 'Bài 11.1: Hai đường thẳng song song', content: {} },
  { lesson_key: '12', title: 'Bài 12: Đường thẳng và mặt phẳng song song', content: {} },
] as const;
export function customLessonText(content: unknown): string {
  return content && typeof content === 'object' && 'text' in content && typeof content.text === 'string' ? content.text : '';
}