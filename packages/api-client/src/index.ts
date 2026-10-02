import { REQUEST_ID_HEADER } from '@dike/contracts';
import createClient from 'openapi-fetch';

import type { paths } from './schema.js';

export interface DikeClientOptions {
  baseUrl: string;
  fetch?: (request: Request) => Promise<Response>;
  requestId?: string;
}

export function createDikeClient({ baseUrl, fetch, requestId }: DikeClientOptions) {
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/$/, ''),
    ...(fetch ? { fetch } : {}),
    ...(requestId ? { headers: { [REQUEST_ID_HEADER]: requestId } } : {}),
  });
}

export type { components, paths } from './schema.js';
