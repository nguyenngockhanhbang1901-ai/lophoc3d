import { describe, expect, it } from 'vitest';
import { defaultClassroomTitle } from './classroom-title';
describe('default classroom name', () => {
  it('includes the selected lesson and Vietnam date and 12-hour creation time', () => {
    expect(defaultClassroomTitle('Bài 12: Đường thẳng và mặt phẳng song song', new Date('2026-11-15T03:17:00Z')))
      .toBe('Bài 12: Đường thẳng và mặt phẳng song song - 15/11/2026 - 10:17 am');
  });
  it('uses the selected lesson and handles the Vietnam date boundary', () => {
    expect(defaultClassroomTitle('Bài 11: Hai đường thẳng song song', new Date('2026-11-15T17:05:00Z')))
      .toBe('Bài 11: Hai đường thẳng song song - 16/11/2026 - 12:05 am');
  });
});