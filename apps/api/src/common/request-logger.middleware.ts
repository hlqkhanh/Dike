import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { API_LOGGER } from './tokens.js';
import { RequestContext } from './request-context.js';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(
    @Inject(API_LOGGER) private readonly logger: Logger,
    @Inject(RequestContext) private readonly context: RequestContext,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();
    response.on('finish', () => {
      this.logger.info(
        {
          requestId: this.context.requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        },
        'request completed',
      );
    });
    next();
  }
}
