import { randomUUID } from 'node:crypto';

import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@dike/contracts';
import type { NextFunction, Request, Response } from 'express';

import { RequestContext } from './request-context.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(@Inject(RequestContext) private readonly context: RequestContext) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header(REQUEST_ID_HEADER);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const requestId = incoming && isUuid.test(incoming) ? incoming : randomUUID();
    response.setHeader(REQUEST_ID_HEADER, requestId);
    this.context.run({ requestId }, next);
  }
}
