import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
    public readonly details?: Array<{ field?: string; message: string }>,
    public readonly retryAfterSeconds?: number,
  ) {
    super({ code, message, ...(details ? { details } : {}) }, status);
  }
}
