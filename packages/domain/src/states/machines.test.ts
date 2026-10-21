import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  EVENT_TRANSITIONS,
  InvalidTransitionError,
  ORDER_LINE_TRANSITIONS,
  SESSION_TRANSITIONS,
} from './machines.js';

describe('máy trạng thái', () => {
  it('phiên bàn', () => {
    expect(canTransition(SESSION_TRANSITIONS, 'PENDING', 'OPEN')).toBe(true);
    expect(canTransition(SESSION_TRANSITIONS, 'CLOSED', 'OPEN')).toBe(false);
    expect(() => assertTransition('Phiên', SESSION_TRANSITIONS, 'CLOSED', 'OPEN')).toThrow(InvalidTransitionError);
  });
  it('dòng món không quay lại DRAFT sau khi gửi', () => {
    expect(canTransition(ORDER_LINE_TRANSITIONS, 'SENT', 'DRAFT')).toBe(false);
    expect(canTransition(ORDER_LINE_TRANSITIONS, 'READY', 'SERVED')).toBe(true);
  });
  it('tiệc đi đúng quy trình', () => {
    expect(canTransition(EVENT_TRANSITIONS, 'LEAD', 'CONFIRMED')).toBe(false);
    expect(canTransition(EVENT_TRANSITIONS, 'CONTRACTED', 'CONFIRMED')).toBe(true);
    expect(canTransition(EVENT_TRANSITIONS, 'IN_PROGRESS', 'CANCELLED')).toBe(false);
  });
});
