import { createHash, randomBytes, randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { hashSecret, verifySecret } from '@dalan/db';
import { normalizeVnPhone } from '@dalan/domain';
import type { AuthTokens, CustomerLoginResult, StaffMe } from '@dalan/contracts';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ApiException, Errors } from '../../common/errors.js';
import { TokensService } from '../../common/auth/tokens.service.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { MessagingService } from '../notifications/messaging.service.js';

const MAX_PIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    @Inject(ENV) private readonly env: Env,
    private readonly messaging: MessagingService,
  ) {}

  // ───────── Nhân viên ─────────

  async staffLoginWithPassword(login: string, password: string, branchId?: string): Promise<AuthTokens & { me: StaffMe }> {
    const staff = await this.prisma.staff.findFirst({
      where: { isActive: true, OR: [{ code: login.toUpperCase() }, { email: login.toLowerCase() }] },
      include: { role: true, branches: { include: { branch: true } } },
    });
    if (!staff || !verifySecret(password, staff.passwordHash)) {
      throw Errors.unauthorized('Sai mã nhân viên hoặc mật khẩu');
    }
    return this.issueStaffTokens(staff, branchId ?? null, null);
  }

  /** Đăng nhập PIN trên thiết bị đã đăng ký (header x-device-token). */
  async staffLoginWithPin(deviceToken: string, staffId: string, pin: string): Promise<AuthTokens & { me: StaffMe }> {
    const device = await this.resolveDevice(deviceToken);
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, isActive: true, branches: { some: { branchId: device.branchId } } },
      include: { role: true, branches: { include: { branch: true } } },
    });
    if (!staff) throw Errors.unauthorized('Nhân viên không thuộc cơ sở của thiết bị');
    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      throw new ApiException('ACCOUNT_LOCKED', `Tài khoản bị khóa tạm thời, thử lại sau ${LOCK_MINUTES} phút`, HttpStatus.LOCKED);
    }
    if (!verifySecret(pin, staff.pinHash)) {
      const attempts = staff.failedPinAttempts + 1;
      await this.prisma.staff.update({
        where: { id: staff.id },
        data: {
          failedPinAttempts: attempts >= MAX_PIN_ATTEMPTS ? 0 : attempts,
          lockedUntil: attempts >= MAX_PIN_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw Errors.unauthorized('Sai mã PIN');
    }
    if (staff.failedPinAttempts > 0) {
      await this.prisma.staff.update({ where: { id: staff.id }, data: { failedPinAttempts: 0, lockedUntil: null } });
    }
    await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return this.issueStaffTokens(staff, device.branchId, device.id);
  }

  /** Danh sách nhân viên có thể đăng nhập PIN trên thiết bị (hiển thị avatar để chạm). */
  async staffForDevice(deviceToken: string) {
    const device = await this.resolveDevice(deviceToken);
    const staff = await this.prisma.staff.findMany({
      where: { isActive: true, pinHash: { not: null }, branches: { some: { branchId: device.branchId } } },
      select: { id: true, code: true, fullName: true, avatarUrl: true, role: { select: { code: true, name: true } } },
      orderBy: { fullName: 'asc' },
    });
    return { device: { id: device.id, name: device.name, kind: device.kind, branchId: device.branchId }, staff };
  }

  /** Quản lý đăng ký thiết bị, nhận token thiết bị (chỉ hiển thị một lần). */
  async registerDevice(by: StaffPrincipal, input: { branchId: string; name: string; kind: 'POS' | 'TABLET' | 'KDS' | 'PRINT_BRIDGE' | 'CUSTOMER_DISPLAY'; defaultStationId?: string }) {
    const raw = `dev_${randomBytes(24).toString('base64url')}`;
    const device = await this.prisma.device.create({
      data: {
        branchId: input.branchId,
        name: input.name,
        kind: input.kind,
        tokenHash: sha256(raw),
        defaultStationId: input.defaultStationId ?? null,
        registeredById: by.staffId,
      },
    });
    return { device: { id: device.id, name: device.name, kind: device.kind, branchId: device.branchId }, deviceToken: raw };
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.prisma.device.update({ where: { id: deviceId }, data: { isActive: false } });
    await this.prisma.refreshToken.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Thiết bị cầu in: xác thực token và yêu cầu đúng loại PRINT_BRIDGE. */
  async resolveDeviceForBridge(deviceToken: string) {
    const device = await this.resolveDevice(deviceToken);
    if (device.kind !== 'PRINT_BRIDGE') throw Errors.forbidden('Thiết bị không phải cầu in');
    return device;
  }

  /** Xác thực token thiết bị bất kỳ (dùng cho realtime). */
  async resolveDeviceToken(deviceToken: string) {
    return this.resolveDevice(deviceToken);
  }

  private async resolveDevice(deviceToken: string) {
    const device = await this.prisma.device.findUnique({ where: { tokenHash: sha256(deviceToken) } });
    if (!device || !device.isActive) throw Errors.unauthorized('Thiết bị chưa đăng ký hoặc đã bị thu hồi');
    return device;
  }

  private async issueStaffTokens(
    staff: {
      id: string;
      orgId: string;
      code: string;
      fullName: string;
      role: { code: string; name: string; permissions: string[] };
      branches: { branchId: string; isDefault: boolean; branch: { id: string; code: string; name: string } }[];
    },
    activeBranchId: string | null,
    deviceId: string | null,
  ): Promise<AuthTokens & { me: StaffMe }> {
    const branchIds = staff.branches.map((b) => b.branchId);
    const resolvedBranch = activeBranchId && branchIds.includes(activeBranchId) ? activeBranchId : (staff.branches.find((b) => b.isDefault)?.branchId ?? branchIds[0] ?? null);
    const principal: Omit<StaffPrincipal, 'kind'> = {
      staffId: staff.id,
      orgId: staff.orgId,
      roleCode: staff.role.code,
      permissions: staff.role.permissions,
      branchIds,
      activeBranchId: resolvedBranch,
      deviceId,
      fullName: staff.fullName,
    };
    const accessToken = await this.tokens.signAccess({ typ: 'staff', ...principal });
    const refreshToken = await this.createRefreshToken({ staffId: staff.id, deviceId });
    const me: StaffMe = {
      staffId: staff.id,
      fullName: staff.fullName,
      code: staff.code,
      roleCode: staff.role.code,
      roleName: staff.role.name,
      permissions: staff.role.permissions,
      branches: staff.branches.map((b) => ({ id: b.branch.id, code: b.branch.code, name: b.branch.name, isDefault: b.isDefault })),
      activeBranchId: resolvedBranch,
      deviceId,
    };
    return { accessToken, refreshToken, expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS, me };
  }

  async me(principal: StaffPrincipal): Promise<StaffMe> {
    const staff = await this.prisma.staff.findUniqueOrThrow({
      where: { id: principal.staffId },
      include: { role: true, branches: { include: { branch: true } } },
    });
    return {
      staffId: staff.id,
      fullName: staff.fullName,
      code: staff.code,
      roleCode: staff.role.code,
      roleName: staff.role.name,
      permissions: staff.role.permissions,
      branches: staff.branches.map((b) => ({ id: b.branch.id, code: b.branch.code, name: b.branch.name, isDefault: b.isDefault })),
      activeBranchId: principal.activeBranchId,
      deviceId: principal.deviceId,
    };
  }

  // ───────── Refresh token xoay vòng ─────────

  private async createRefreshToken(owner: { staffId?: string; customerId?: string; deviceId?: string | null }): Promise<string> {
    const raw = `rt_${randomBytes(32).toString('base64url')}`;
    await this.prisma.refreshToken.create({
      data: {
        staffId: owner.staffId ?? null,
        customerId: owner.customerId ?? null,
        deviceId: owner.deviceId ?? null,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return raw;
  }

  async refresh(rawToken: string): Promise<AuthTokens> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw Errors.unauthorized('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
    }
    if (stored.staffId) {
      const staff = await this.prisma.staff.findFirst({ where: { id: stored.staffId, isActive: true }, include: { role: true, branches: { include: { branch: true } } } });
      if (!staff) throw Errors.unauthorized();
      const device = stored.deviceId ? await this.prisma.device.findUnique({ where: { id: stored.deviceId } }) : null;
      const issued = await this.issueStaffTokens(staff, device?.branchId ?? null, stored.deviceId);
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), replacedById: sha256(issued.refreshToken) } });
      return { accessToken: issued.accessToken, refreshToken: issued.refreshToken, expiresIn: issued.expiresIn };
    }
    if (stored.customerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: stored.customerId, deletedAt: null } });
      if (!customer) throw Errors.unauthorized();
      const accessToken = await this.tokens.signAccess({ typ: 'customer', customerId: customer.id, orgId: customer.orgId, phone: customer.phone });
      const refreshToken = await this.createRefreshToken({ customerId: customer.id });
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), replacedById: sha256(refreshToken) } });
      return { accessToken, refreshToken, expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS };
    }
    throw Errors.unauthorized();
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ───────── Khách thành viên: OTP ─────────

  async requestOtp(phoneInput: string, purpose: string): Promise<{ sent: boolean; devCode?: string; expiresInSeconds: number }> {
    const phone = normalizeVnPhone(phoneInput);
    if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
    const recent = await this.prisma.otpCode.count({ where: { phone, purpose, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent > 0) throw new ApiException('OTP_RATE_LIMITED', 'Vui lòng đợi 60 giây trước khi gửi lại mã', HttpStatus.TOO_MANY_REQUESTS);
    const code = this.env.MESSAGING_PROVIDER === 'mock' ? '123456' : randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpCode.create({ data: { phone, purpose, codeHash: hashSecret(code), expiresAt: new Date(Date.now() + 5 * 60_000) } });
    // Gửi qua ZNS (dự phòng SMS) bằng MessagingService; ở chế độ mock chỉ ghi NotificationLog và log.
    await this.messaging.sendOtp(phone, code, purpose);
    this.logger.log(`OTP ${purpose} cho ${phone}: ${this.env.MESSAGING_PROVIDER === 'mock' ? code : '******'}`);
    return { sent: true, devCode: this.env.NODE_ENV !== 'production' ? code : undefined, expiresInSeconds: 300 };
  }

  async verifyOtp(phoneInput: string, code: string, purpose: string, fullName?: string): Promise<AuthTokens & { customer: { id: string; phone: string; fullName: string | null; isNew: boolean } }> {
    const phone = normalizeVnPhone(phoneInput);
    if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
    const otp = await this.prisma.otpCode.findFirst({ where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!otp || otp.attempts >= 5 || !verifySecret(code, otp.codeHash)) {
      if (otp) await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw Errors.unauthorized('Mã OTP không đúng hoặc đã hết hạn');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    const org = await this.prisma.organization.findFirstOrThrow();
    const existing = await this.prisma.customer.findUnique({ where: { orgId_phone: { orgId: org.id, phone } } });
    const customer =
      existing ??
      (await this.prisma.customer.create({ data: { orgId: org.id, phone, fullName: fullName ?? null, source: 'otp', firstVisitAt: new Date() } }));
    if (existing && fullName && !existing.fullName) {
      await this.prisma.customer.update({ where: { id: existing.id }, data: { fullName } });
    }
    const accessToken = await this.tokens.signAccess({ typ: 'customer', customerId: customer.id, orgId: customer.orgId, phone: customer.phone });
    const refreshToken = await this.createRefreshToken({ customerId: customer.id });
    return {
      accessToken,
      refreshToken,
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      customer: { id: customer.id, phone: customer.phone, fullName: customer.fullName ?? fullName ?? null, isNew: !existing },
    };
  }

  // ───────── Khách thành viên: Zalo Mini App ─────────

  /**
   * Đăng nhập bằng Zalo: xác thực accessToken với Zalo Graph API, đổi phoneToken lấy số điện thoại (nếu có),
   * tìm hoặc tạo Customer theo số điện thoại / zaloUserId rồi cấp token như verifyOtp.
   * Chế độ dev (MESSAGING_PROVIDER=mock): chấp nhận accessToken dạng `mock:<zaloUserId>[:<phone>[:<tên>]]`.
   */
  async loginWithZalo(accessToken: string, phoneToken?: string): Promise<CustomerLoginResult> {
    const profile = await this.resolveZaloProfile(accessToken, phoneToken);
    const phone = profile.phone ? normalizeVnPhone(/^84\d{9,10}$/.test(profile.phone) ? `+${profile.phone}` : profile.phone) : null;
    if (profile.phone && !phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại Zalo không hợp lệ');

    const org = await this.prisma.organization.findFirstOrThrow();
    const byPhone = phone ? await this.prisma.customer.findUnique({ where: { orgId_phone: { orgId: org.id, phone } } }) : null;
    const byZalo = byPhone ? null : await this.prisma.customer.findFirst({ where: { orgId: org.id, zaloUserId: profile.id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const existing = byPhone ?? byZalo;
    if (existing?.deletedAt) throw Errors.forbidden('Tài khoản đã bị xóa theo yêu cầu, vui lòng liên hệ nhà hàng');

    let customer;
    if (existing) {
      const patch: { zaloUserId?: string; fullName?: string; avatarUrl?: string } = {};
      if (!existing.zaloUserId) patch.zaloUserId = profile.id;
      if (!existing.fullName && profile.name) patch.fullName = profile.name;
      if (!existing.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;
      customer = Object.keys(patch).length ? await this.prisma.customer.update({ where: { id: existing.id }, data: patch }) : existing;
    } else {
      if (!phone) {
        throw Errors.invalid('ZALO_PHONE_REQUIRED', 'Cần cho phép chia sẻ số điện thoại Zalo để tạo tài khoản thành viên');
      }
      customer = await this.prisma.customer.create({
        data: { orgId: org.id, phone, fullName: profile.name ?? null, zaloUserId: profile.id, avatarUrl: profile.avatarUrl ?? null, source: 'zalo', firstVisitAt: new Date() },
      });
    }

    const tokens = await this.issueCustomerTokens(customer);
    return {
      ...tokens,
      customer: { id: customer.id, phone: customer.phone, fullName: customer.fullName, isNew: !existing, zaloUserId: customer.zaloUserId, avatarUrl: customer.avatarUrl },
    };
  }

  private async issueCustomerTokens(customer: { id: string; orgId: string; phone: string }): Promise<AuthTokens> {
    const accessToken = await this.tokens.signAccess({ typ: 'customer', customerId: customer.id, orgId: customer.orgId, phone: customer.phone });
    const refreshToken = await this.createRefreshToken({ customerId: customer.id });
    return { accessToken, refreshToken, expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS };
  }

  private async resolveZaloProfile(accessToken: string, phoneToken?: string): Promise<{ id: string; name: string | null; avatarUrl: string | null; phone: string | null }> {
    if (accessToken.startsWith('mock:')) {
      if (this.env.MESSAGING_PROVIDER !== 'mock') throw Errors.unauthorized('Phiên Zalo không hợp lệ');
      const [, id, mockPhone, ...nameParts] = accessToken.split(':');
      if (!id) throw Errors.invalid('INVALID_MOCK_TOKEN', 'Token giả lập phải có dạng mock:<zaloUserId>[:<sđt>[:<tên>]]');
      const phoneFromToken = phoneToken?.startsWith('mock:') ? phoneToken.slice(5) : null;
      return { id: `mock-${id}`, name: nameParts.join(':') || null, avatarUrl: null, phone: phoneFromToken || mockPhone || null };
    }

    const me = await this.zaloGraph<{ id?: string; name?: string; picture?: { data?: { url?: string } } }>('https://graph.zalo.me/v2.0/me?fields=id,name,picture', { access_token: accessToken });
    if (!me.id) throw Errors.unauthorized('Phiên Zalo không hợp lệ hoặc đã hết hạn');

    let phone: string | null = null;
    if (phoneToken) {
      if (!this.env.ZALO_APP_SECRET) {
        throw new ApiException('ZALO_NOT_CONFIGURED', 'Máy chủ chưa cấu hình ZALO_APP_SECRET để lấy số điện thoại', HttpStatus.SERVICE_UNAVAILABLE);
      }
      // https://graph.zalo.me/v2.0/me/info — token dùng một lần, hết hạn sau 2 phút
      const info = await this.zaloGraph<{ data?: { number?: string } }>('https://graph.zalo.me/v2.0/me/info', { access_token: accessToken, code: phoneToken, secret_key: this.env.ZALO_APP_SECRET });
      phone = info.data?.number ?? null;
      if (!phone) throw Errors.unauthorized('Không lấy được số điện thoại từ Zalo, vui lòng thử lại');
    }
    return { id: me.id, name: me.name ?? null, avatarUrl: me.picture?.data?.url ?? null, phone };
  }

  private async zaloGraph<T>(url: string, headers: Record<string, string>): Promise<T & { error?: number; message?: string }> {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    } catch (err) {
      this.logger.warn(`Không gọi được Zalo Graph API: ${(err as Error).message}`);
      throw new ApiException('ZALO_UNAVAILABLE', 'Không kết nối được Zalo, vui lòng thử lại', HttpStatus.BAD_GATEWAY);
    }
    const body = (await res.json().catch(() => ({}))) as T & { error?: number; message?: string };
    if (!res.ok || (typeof body.error === 'number' && body.error !== 0)) {
      this.logger.warn(`Zalo Graph API lỗi ${res.status} ${body.error ?? ''}: ${body.message ?? ''}`);
      throw Errors.unauthorized('Phiên Zalo không hợp lệ hoặc đã hết hạn');
    }
    return body;
  }

  /** Xác thực PIN quản lý tại chỗ cho thao tác vượt hạn mức; trả về staffId người duyệt. */
  async verifyManagerPin(branchId: string, pin: string, requiredPermission: string): Promise<{ staffId: string; fullName: string }> {
    const managers = await this.prisma.staff.findMany({
      where: { isActive: true, pinHash: { not: null }, branches: { some: { branchId } } },
      include: { role: true },
    });
    for (const m of managers) {
      const perms = m.role.permissions;
      const allowed = perms.includes('*') || perms.includes(requiredPermission) || perms.includes(`${requiredPermission.split('.')[0]}.*`);
      if (allowed && verifySecret(pin, m.pinHash)) return { staffId: m.id, fullName: m.fullName };
    }
    throw Errors.forbidden('PIN quản lý không đúng hoặc không đủ quyền');
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
