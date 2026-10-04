import { NextResponse, type NextRequest } from 'next/server';

import {
  accessCookieName,
  clearSessionCookies,
  requireMutationSecurity,
  safeErrorResponse,
  signedApiClient,
} from '../../../../lib/server/bff';

export async function POST(request: NextRequest) {
  try {
    const csrf = requireMutationSecurity(request);
    const accessToken = request.cookies.get(accessCookieName())?.value;
    if (!accessToken) return safeErrorResponse(undefined, 401);
    const headers = { authorization: `Bearer ${accessToken}`, 'x-csrf-token': csrf };
    const { error, response: upstream } = await signedApiClient(
      'POST',
      '/auth/logout-all',
      undefined,
      headers,
    ).POST('/auth/logout-all');
    if (error || !upstream.ok) return safeErrorResponse(error, upstream.status);
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
