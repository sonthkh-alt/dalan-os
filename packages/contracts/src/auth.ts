import { z } from 'zod';
import { idSchema, phoneSchema } from './common.js';

export const staffLoginSchema = z.object({
  /** Mã nhân viên hoặc email */
  login: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  branchId: idSchema.optional(),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const pinLoginSchema = z.object({
  staffId: idSchema,
  pin: z.string().regex(/^\d{4,6}$/, 'PIN gồm 4-6 chữ số'),
});
export type PinLoginInput = z.infer<typeof pinLoginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const registerDeviceSchema = z.object({
  branchId: idSchema,
  name: z.string().min(1).max(100),
  kind: z.enum(['POS', 'TABLET', 'KDS', 'PRINT_BRIDGE', 'CUSTOMER_DISPLAY']),
  defaultStationId: idSchema.optional(),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const otpRequestSchema = z.object({ phone: phoneSchema, purpose: z.enum(['login', 'reservation']).default('login') });
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['login', 'reservation']).default('login'),
  fullName: z.string().max(100).optional(),
});

/**
 * Đăng nhập khách thành viên từ Zalo Mini App.
 * accessToken: từ zmp-sdk getAccessToken(); phoneToken: từ getPhoneNumber() (dùng một lần, hết hạn sau 2 phút).
 */
export const zaloLoginSchema = z.object({
  accessToken: z.string().min(1).max(4000),
  phoneToken: z.string().min(1).max(4000).optional(),
});
export type ZaloLoginInput = z.infer<typeof zaloLoginSchema>;

export interface CustomerLoginResult extends AuthTokens {
  customer: { id: string; phone: string; fullName: string | null; isNew: boolean; zaloUserId?: string | null; avatarUrl?: string | null };
}

export const guestJoinSchema = z.object({
  nickname: z.string().max(40).optional(),
  joinPin: z.string().regex(/^\d{4}$/).optional(),
  guestCount: z.number().int().min(1).max(200).optional(),
  locale: z.enum(['vi', 'en']).default('vi'),
  deviceFingerprint: z.string().max(100).optional(),
});
export type GuestJoinInput = z.infer<typeof guestJoinSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface StaffMe {
  staffId: string;
  fullName: string;
  code: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  branches: { id: string; code: string; name: string; isDefault: boolean }[];
  activeBranchId: string | null;
  deviceId: string | null;
}
