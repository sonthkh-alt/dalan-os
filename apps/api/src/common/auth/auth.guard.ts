import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { Errors } from '../errors.js';
import { canAccessBranch, hasPermission, type Principal, type StaffPrincipal } from './principal.js';
import { TokensService } from './tokens.service.js';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';
export const ALLOW_GUEST = 'allowGuest';
export const ALLOW_CUSTOMER = 'allowCustomer';

/** Endpoint không cần xác thực. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Yêu cầu nhân viên có ít nhất một trong các quyền. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS, permissions);
/** Cho phép token phiên khách QR. */
export const AllowGuest = () => SetMetadata(ALLOW_GUEST, true);
/** Cho phép khách thành viên đã đăng nhập. */
export const AllowCustomer = () => SetMetadata(ALLOW_CUSTOMER, true);

export type RequestWithPrincipal = FastifyRequest & { principal?: Principal };

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal | undefined => {
  return ctx.switchToHttp().getRequest<RequestWithPrincipal>().principal;
});

export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffPrincipal => {
  const p = ctx.switchToHttp().getRequest<RequestWithPrincipal>().principal;
  if (!p || p.kind !== 'staff') throw Errors.unauthorized();
  return p;
});

/**
 * Guard toàn cục: đọc Bearer token, gắn principal vào request, kiểm tra quyền.
 * Token khách QR gửi qua header `x-guest-token` hoặc Bearer với audience guest.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();

    const principal = await this.resolvePrincipal(request);
    if (principal) request.principal = principal;
    if (isPublic) return true;
    if (!principal) throw Errors.unauthorized();

    const allowGuest = this.reflector.getAllAndOverride<boolean>(ALLOW_GUEST, targets);
    const allowCustomer = this.reflector.getAllAndOverride<boolean>(ALLOW_CUSTOMER, targets);
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, targets) ?? [];

    if (principal.kind === 'guest') {
      if (!allowGuest) throw Errors.forbidden('Khách tại bàn không có quyền này');
      return true;
    }
    if (principal.kind === 'customer') {
      if (!allowCustomer) throw Errors.forbidden('Tài khoản khách hàng không có quyền này');
      return true;
    }
    if (required.length > 0 && !required.some((p) => hasPermission(principal.permissions, p))) {
      throw Errors.forbidden();
    }
    const branchId = extractBranchId(request);
    if (branchId && !canAccessBranch(principal, branchId)) {
      throw Errors.forbidden('Bạn không thuộc cơ sở này');
    }
    return true;
  }

  private async resolvePrincipal(request: FastifyRequest): Promise<Principal | null> {
    const guestHeader = request.headers['x-guest-token'];
    if (typeof guestHeader === 'string' && guestHeader) {
      const guest = await this.tokens.verifyGuest(guestHeader);
      if (guest) return guest;
    }
    const auth = request.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      return (await this.tokens.verifyAccess(token)) ?? (await this.tokens.verifyGuest(token));
    }
    return null;
  }
}

function extractBranchId(request: FastifyRequest): string | null {
  const params = request.params as Record<string, string | undefined> | undefined;
  const query = request.query as Record<string, string | undefined> | undefined;
  return params?.branchId ?? query?.branchId ?? null;
}
