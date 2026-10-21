import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../../config/env.js';
import type { CustomerPrincipal, GuestPrincipal, StaffPrincipal } from './principal.js';

type AccessPayload =
  | ({ typ: 'staff' } & Omit<StaffPrincipal, 'kind'>)
  | ({ typ: 'customer' } & Omit<CustomerPrincipal, 'kind'>);

/** Ký và xác minh JWT (HS256 qua jose): access cho nhân viên/khách thành viên, token phiên cho khách QR. */
@Injectable()
export class TokensService {
  private readonly accessKey: Uint8Array;
  private readonly guestKey: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    this.guestKey = new TextEncoder().encode(env.GUEST_TOKEN_SECRET);
  }

  async signAccess(payload: AccessPayload): Promise<string> {
    return new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('dalan-os')
      .setAudience('api')
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.accessKey);
  }

  async verifyAccess(token: string): Promise<StaffPrincipal | CustomerPrincipal | null> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, { issuer: 'dalan-os', audience: 'api' });
      const p = payload as unknown as AccessPayload;
      if (p.typ === 'staff') {
        const { typ: _typ, ...rest } = p;
        return { kind: 'staff', ...rest };
      }
      if (p.typ === 'customer') {
        const { typ: _typ, ...rest } = p;
        return { kind: 'customer', ...rest };
      }
      return null;
    } catch {
      return null;
    }
  }

  async signGuest(principal: Omit<GuestPrincipal, 'kind'>): Promise<string> {
    return new SignJWT({ ...principal })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('dalan-os')
      .setAudience('guest')
      .setExpirationTime(`${this.env.GUEST_TOKEN_TTL_SECONDS}s`)
      .sign(this.guestKey);
  }

  async verifyGuest(token: string): Promise<GuestPrincipal | null> {
    try {
      const { payload } = await jwtVerify(token, this.guestKey, { issuer: 'dalan-os', audience: 'guest' });
      const p = payload as unknown as Omit<GuestPrincipal, 'kind'>;
      if (!p.sessionId || !p.participantId || !p.branchId) return null;
      return { kind: 'guest', sessionId: p.sessionId, participantId: p.participantId, branchId: p.branchId };
    } catch {
      return null;
    }
  }
}
