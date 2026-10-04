import { NextResponse, type NextRequest } from 'next/server';

import {
  accessCookieName,
  clearSessionCookies,
  requireMutationSecurity,
  safeErrorResponse,
  signedApiClient,
} from '../../../../../lib/server/bff';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const csrf = requireMutationSecurity(request);
    const accessToken = request.cookies.get(accessCookieName())?.value;
    if (!accessToken) return safeErrorResponse(undefined, 401);
    const { sessionId } = await context.params;
    const path = `/auth/sessions/${encodeURIComponent(sessionId)}`;
    const headers = { authorization: `Bearer ${accessToken}`, 'x-csrf-token': csrf };
    const { data, error } = await signedApiClient('DELETE', path, undefined, headers).DELETE(
      '/auth/sessions/{sessionId}',
      { params: { path: { sessionId } } },
    );
    if (error || !data) return safeErrorResponse(error);
    const result = NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
    if (data.revokedCurrent) clearSessionCookies(result);
    return result;
  } catch (error) {
    return safeErrorResponse(error);
  }
}
