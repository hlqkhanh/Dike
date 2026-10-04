import { NextResponse, type NextRequest } from 'next/server';

import {
  accessCookieName,
  clearSessionCookies,
  refreshCookieName,
  safeErrorResponse,
  signedApiClient,
} from '../../../../lib/server/bff';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(accessCookieName())?.value;
  const refreshToken = request.cookies.get(refreshCookieName())?.value;
  if (!accessToken) {
    if (refreshToken) {
      return NextResponse.json(
        { error: { code: 'SESSION_REFRESH_REQUIRED', message: 'Session refresh is required' } },
        { status: 401, headers: { 'cache-control': 'no-store, private' } },
      );
    }
    return NextResponse.json(
      { authenticated: false },
      { headers: { 'cache-control': 'no-store, private' } },
    );
  }
  try {
    const headers = { authorization: `Bearer ${accessToken}` };
    const { data, error } = await signedApiClient('GET', '/auth/session', undefined, headers).GET(
      '/auth/session',
    );
    if (error || !data) {
      const failed = safeErrorResponse(error);
      const code = (error as { error?: { code?: string } } | undefined)?.error?.code;
      if (code === 'SESSION_REVOKED' || code === 'SESSION_REQUIRED') clearSessionCookies(failed);
      return failed;
    }
    return NextResponse.json(data, { headers: { 'cache-control': 'no-store, private' } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
