import { NextResponse, type NextRequest } from 'next/server';
import {
  accessCookieName,
  BffRequestError,
  requireMutationSecurity,
  safeErrorResponse,
} from './bff';

export function profileHeaders(request: NextRequest, mutation = false): Record<string, string> {
  const csrf = mutation ? requireMutationSecurity(request) : undefined;
  const token = request.cookies.get(accessCookieName())?.value;
  if (!token)
    throw new BffRequestError('SESSION_REFRESH_REQUIRED', 'Session refresh required', 401);
  return { authorization: `Bearer ${token}`, ...(csrf ? { 'x-csrf-token': csrf } : {}) };
}
export function profileResponse(result: { data?: unknown; error?: unknown; response: Response }) {
  if (!result.response.ok) {
    const response = safeErrorResponse(result.error, result.response.status);
    const retry = result.response.headers.get('retry-after');
    if (retry && /^\d+$/.test(retry)) response.headers.set('retry-after', retry);
    return response;
  }
  return result.response.status === 204
    ? new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store, private' } })
    : NextResponse.json(result.data, { headers: { 'cache-control': 'no-store, private' } });
}
