import { NextResponse, type NextRequest } from 'next/server';

import {
  clearSessionCookies,
  refreshCookieName,
  requireMutationSecurity,
  safeErrorResponse,
  setSessionCookies,
  signedApiClient,
} from '../../../../../lib/server/bff';

export async function POST(request: NextRequest) {
  try {
    requireMutationSecurity(request);
    const refreshToken = request.cookies.get(refreshCookieName())?.value;
    if (!refreshToken) return safeErrorResponse(undefined, 401);
    const body = { refreshToken };
    const { data, error } = await signedApiClient('POST', '/auth/session/refresh', body).POST(
      '/auth/session/refresh',
      { body },
    );
    if (error || !data) {
      const failed = safeErrorResponse(error);
      const code = (error as { error?: { code?: string } } | undefined)?.error?.code;
      if (code !== 'SESSION_REFRESHED') clearSessionCookies(failed);
      return failed;
    }
    const result = NextResponse.json(data.session, {
      headers: { 'cache-control': 'no-store, private' },
    });
    setSessionCookies(result, data);
    return result;
  } catch (error) {
    return safeErrorResponse(error);
  }
}
