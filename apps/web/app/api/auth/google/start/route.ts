import { NextResponse, type NextRequest } from 'next/server';

import {
  authReturnPath,
  safeErrorResponse,
  signedApiClient,
  transactionCookieName,
} from '../../../../../lib/server/bff';
import { serverEnvironment } from '../../../../../lib/server/environment';

export async function GET(request: NextRequest) {
  const returnTo = authReturnPath(request.nextUrl.searchParams.get('returnTo'));
  if (!returnTo) return safeErrorResponse(undefined, 400);
  const body = { returnTo };
  try {
    const { data, error } = await signedApiClient('POST', '/auth/google/start', body).POST(
      '/auth/google/start',
      { body },
    );
    if (error || !data) return safeErrorResponse(error);
    const redirect = NextResponse.redirect(data.authorizationUrl, 303);
    redirect.cookies.set(transactionCookieName(), data.transactionToken, {
      httpOnly: true,
      secure: serverEnvironment().secureCookies,
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 600,
    });
    redirect.headers.set('cache-control', 'no-store');
    redirect.headers.set('referrer-policy', 'no-referrer');
    return redirect;
  } catch (error) {
    return safeErrorResponse(error);
  }
}
