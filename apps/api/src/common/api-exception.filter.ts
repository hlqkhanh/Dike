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
import { ApiError } from './api-error.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly context: RequestContext,
    @Inject(API_LOGGER) private readonly logger: Logger,
    private readonly diagnostics = false,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const structured =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : undefined;
    const validation =
      status === 400 && typeof body === 'object' && body !== null
        ? (body as { message?: unknown }).message
        : undefined;
    const details: ApiErrorDetail[] | undefined = Array.isArray(validation)
      ? validation.map((message) => ({ message: String(message) }))
      : undefined;
    const code =
      typeof structured?.code === 'string'
        ? structured.code
        : status === 400
          ? 'VALIDATION_ERROR'
          : status === 404
            ? 'NOT_FOUND'
            : status >= 500
              ? 'INTERNAL_ERROR'
              : 'REQUEST_ERROR';
    const message =
      status >= 500
        ? 'An unexpected error occurred'
        : typeof structured?.message === 'string'
          ? structured.message
          : exception instanceof HttpException
            ? exception.message
            : 'Request failed';

    if (status >= 500) {
      this.logger.error(
        {
          requestId: this.context.requestId,
          errorType: exception?.constructor?.name,
          ...(this.diagnostics && exception instanceof Error
            ? { errorMessage: exception.message.slice(0, 300) }
            : {}),
        },
        'request failed',
      );
    }
    const structuredDetails = Array.isArray(structured?.details)
      ? (structured.details as ApiErrorDetail[])
      : details;
    const envelope: ApiErrorEnvelope = {
      error: {
        code,
        message,
        requestId: this.context.requestId,
        ...(structuredDetails ? { details: structuredDetails } : {}),
      },
    };
    if (exception instanceof ApiError && exception.retryAfterSeconds !== undefined) {
      response.setHeader('retry-after', String(exception.retryAfterSeconds));
    }
    response.status(status).json(envelope);
  }
}
