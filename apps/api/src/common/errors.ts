import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Lỗi nghiệp vụ có mã máy đọc được (code) và thông điệp tiếng Việt cho người dùng.
 * Mọi lỗi trả về theo hình dạng ApiError trong @dalan/contracts.
 */
export class ApiException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const Errors = {
  notFound: (what: string) => new ApiException('NOT_FOUND', `Không tìm thấy ${what}`, HttpStatus.NOT_FOUND),
  forbidden: (why = 'Bạn không có quyền thực hiện thao tác này') =>
    new ApiException('FORBIDDEN', why, HttpStatus.FORBIDDEN),
  unauthorized: (why = 'Vui lòng đăng nhập') => new ApiException('UNAUTHORIZED', why, HttpStatus.UNAUTHORIZED),
  conflict: (code: string, message: string, details?: unknown) =>
    new ApiException(code, message, HttpStatus.CONFLICT, details),
  invalid: (code: string, message: string, details?: unknown) =>
    new ApiException(code, message, HttpStatus.BAD_REQUEST, details),
  state: (message: string) => new ApiException('INVALID_STATE', message, HttpStatus.CONFLICT),
};
