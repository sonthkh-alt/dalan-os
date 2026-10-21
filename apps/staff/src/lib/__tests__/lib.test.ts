import { describe, expect, it } from 'vitest';
import { hasPermissionIn } from '../auth-store';
import { elapsed, qty } from '../utils';
import { ApiError, errorMessage, needsApproval } from '../api';

describe('phân quyền phía client', () => {
  it('hỗ trợ * và tài_nguyên.*', () => {
    expect(hasPermissionIn(['*'], 'billing.collect')).toBe(true);
    expect(hasPermissionIn(['billing.*'], 'billing.discount.over_limit')).toBe(true);
    expect(hasPermissionIn(['dining.order'], 'dining.void')).toBe(false);
    expect(hasPermissionIn(undefined, 'x.y')).toBe(false);
  });
});

describe('tiện ích hiển thị', () => {
  it('thời gian ngồi và số lượng', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(elapsed(new Date('2026-10-21T09:48:00Z'), now)).toBe('12 phút');
    expect(elapsed(new Date('2026-10-21T08:55:00Z'), now)).toBe('1g 05p');
    expect(qty(1.2)).toBe('1,2');
    expect(qty(3)).toBe('3');
  });
});

describe('lỗi API', () => {
  it('nhận diện yêu cầu duyệt và thông điệp mạng', () => {
    const approval = new ApiError(400, 'APPROVAL_REQUIRED', 'Cần PIN');
    expect(needsApproval(approval)).toBe(true);
    expect(errorMessage(approval)).toBe('Cần PIN');
    expect(new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng.').isNetwork).toBe(true);
  });
});
