import { NextResponse, type NextRequest } from 'next/server';

import {
  accessCookieName,
  clearSessionCookies,
  refreshCookieName,
  requireMutationSecurity,
  safeErrorResponse,
  signedApiClient,
} from '../../../../lib/server/bff';

export async function POST(request: NextRequest) {
  try {
    requireMutationSecurity(request);
    const accessToken = request.cookies.get(accessCookieName())?.value;
    const refreshToken = request.cookies.get(refreshCookieName())?.value;
    const body = {
      ...(accessToken ? { accessToken } : {}),
      ...(refreshToken ? { refreshToken } : {}),
    };
    await signedApiClient('POST', '/auth/logout', body).POST('/auth/logout', { body });
    const response = new NextResponse(null, {
      status: 204,
      headers: { 'cache-control': 'no-store' },
    });
    clearSessionCookies(response);
    return response;
  } catch (error) {
    return safeErrorResponse(error);
  }
}
