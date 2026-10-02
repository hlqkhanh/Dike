import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorDetail, ApiErrorEnvelope } from '@dike/contracts';
import type { Response } from 'express';
import type { Logger } from 'pino';

import { RequestContext } from './request-context.js';
import { API_LOGGER } from './tokens.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly context: RequestContext,
    @Inject(API_LOGGER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const validation =
      status === 400 && typeof body === 'object' && body !== null
        ? (body as { message?: unknown }).message
        : undefined;
    const details: ApiErrorDetail[] | undefined = Array.isArray(validation)
      ? validation.map((message) => ({ message: String(message) }))
      : undefined;
    const code =
      status === 400
        ? 'VALIDATION_ERROR'
        : status === 404
          ? 'NOT_FOUND'
          : status >= 500
            ? 'INTERNAL_ERROR'
            : 'REQUEST_ERROR';
    const message =
      status >= 500
        ? 'An unexpected error occurred'
        : exception instanceof HttpException
          ? exception.message
          : 'Request failed';

    if (status >= 500) {
      this.logger.error(
        { requestId: this.context.requestId, errorType: exception?.constructor?.name },
        'request failed',
      );
    }
    const envelope: ApiErrorEnvelope = {
      error: { code, message, requestId: this.context.requestId, ...(details ? { details } : {}) },
    };
    response.status(status).json(envelope);
  }
}
