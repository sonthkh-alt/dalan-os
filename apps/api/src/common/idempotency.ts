import { createHash } from 'node:crypto';
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { from, of, switchMap, type Observable } from 'rxjs';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { Errors } from './errors.js';
import { serializeDbValues } from './interceptors/bigint.interceptor.js';

const TTL_MS = 24 * 3600 * 1000;

/**
 * Khóa chống trùng cho lệnh ghi: client gửi header `Idempotency-Key` (UUID). Cùng khóa và cùng nội dung
 * → trả lại kết quả đã lưu; cùng khóa khác nội dung → 409. Giúp hàng đợi offline gửi lại an toàn.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { principal?: { kind: string } }>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !key || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return next.handle();
    }
    const scope = `${request.method} ${request.routeOptions?.url ?? request.url}`;
    const requestHash = createHash('sha256').update(JSON.stringify(request.body ?? null)).digest('hex');
    const storedKey = `${scope}:${key}`;

    return from(this.prisma.idempotencyKey.findUnique({ where: { key: storedKey } })).pipe(
      switchMap((existing) => {
        if (existing && existing.expiresAt > new Date()) {
          if (existing.requestHash !== requestHash) {
            throw Errors.conflict('IDEMPOTENCY_MISMATCH', 'Idempotency-Key đã dùng cho một yêu cầu khác');
          }
          void reply.status(existing.responseStatus);
          reply.header('x-idempotent-replay', 'true');
          return of(existing.responseBody);
        }
        return next.handle().pipe(
          // Lưu kết quả xong mới trả về, để yêu cầu gửi lại ngay sau đó chắc chắn nhận bản sao
          switchMap(async (body) => {
            const serialized = serializeDbValues(body) as object | null;
            const data = { requestHash, responseStatus: reply.statusCode, responseBody: serialized ?? undefined, expiresAt: new Date(Date.now() + TTL_MS) };
            await this.prisma.idempotencyKey
              .upsert({ where: { key: storedKey }, update: data, create: { key: storedKey, scope, ...data } })
              .catch(() => undefined);
            return body;
          }),
        );
      }),
    );
  }
}
