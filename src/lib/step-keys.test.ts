import { describe, it, expect } from 'vitest';
import { stepKeyAction } from './step-keys';
describe('page keys', () => {
  it('PageDown acts like Enter', () => expect(stepKeyAction('PageDown')).toBe(stepKeyAction('Enter')));
  it('PageUp acts like Backspace', () => expect(stepKeyAction('PageUp')).toBe(stepKeyAction('Backspace')));
});
