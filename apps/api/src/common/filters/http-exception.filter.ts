import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InvalidTransitionError } from '@dalan/domain';
import { ApiException } from '../errors.js';

/** Chuẩn hóa mọi lỗi về { statusCode, code, message, details, traceId }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const traceId = request.id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Có lỗi xảy ra, vui lòng thử lại';
    let details: unknown;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = Array.isArray(b.message) ? (b.message as string[]).join('; ') : String(b.message ?? exception.message);
        details = b.details ?? (Array.isArray(b.message) ? b.message : undefined) ?? b.errors ?? b.issues;
      }
      code = status === 400 ? 'VALIDATION_ERROR' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
    } else if (exception instanceof InvalidTransitionError) {
      status = HttpStatus.CONFLICT;
      code = 'INVALID_STATE';
      message = exception.message;
    } else if (exception instanceof RangeError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'INVALID_VALUE';
      message = exception.message;
    } else if (isPrismaKnownError(exception)) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        message = 'Dữ liệu đã tồn tại (trùng mã hoặc khóa duy nhất)';
        details = exception.meta;
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Không tìm thấy bản ghi';
      }
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`, exception instanceof Error ? exception.stack : String(exception));
    }

    void reply.status(status).send({ statusCode: status, code, message, details, traceId });
  }
}

function isPrismaKnownError(e: unknown): e is { code: string; meta?: unknown } {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string' && (e as { code: string }).code.startsWith('P');
}
