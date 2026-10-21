import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { patchSchema } from './common.js';
import { customerUpdateSchema } from './customers.js';
import { menuItemUpdateSchema } from './menu.js';
import { tableSchema } from './org.js';

describe('patchSchema', () => {
  const create = z.object({ name: z.string(), flag: z.boolean().default(false), tags: z.array(z.string()).default([]) });

  it('không áp giá trị mặc định cho trường không gửi', () => {
    expect(patchSchema(create).parse({ name: 'x' })).toEqual({ name: 'x' });
    expect(patchSchema(create).parse({})).toEqual({});
  });

  it('vẫn kiểm tra kiểu của trường có gửi', () => {
    expect(patchSchema(create).parse({ flag: true })).toEqual({ flag: true });
    expect(() => patchSchema(create).parse({ flag: 'có' })).toThrow();
  });

  it('PATCH khách hàng không thu hồi đồng ý nhận tin', () => {
    expect(customerUpdateSchema.parse({ birthday: '2026-10-22' })).toEqual({ birthday: '2026-10-22' });
  });

  it('PATCH món chỉ đổi giá không đặt lại chế độ giá, nhãn, trạng thái', () => {
    expect(menuItemUpdateSchema.parse({ basePrice: 90_000 })).toEqual({ basePrice: 90_000 });
  });

  it('PATCH bàn chỉ đổi tên không đưa vị trí về 0', () => {
    expect(patchSchema(tableSchema).parse({ name: 'Bàn A01' })).toEqual({ name: 'Bàn A01' });
  });
});
