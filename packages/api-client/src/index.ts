import { REQUEST_ID_HEADER } from '@dike/contracts';
import createClient from 'openapi-fetch';

import type { paths } from './schema.js';

export interface DikeClientOptions {
  baseUrl: string;
  fetch?: (request: Request) => Promise<Response>;
  requestId?: string;
  headers?: HeadersInit;
}

export function createDikeClient({ baseUrl, fetch, requestId, headers }: DikeClientOptions) {
  const combined = new Headers(headers);
  if (requestId) combined.set(REQUEST_ID_HEADER, requestId);
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/$/, ''),
    ...(fetch ? { fetch } : {}),
    headers: combined,
  });
}

export type { components, paths } from './schema.js';
