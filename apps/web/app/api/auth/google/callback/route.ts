import { NextResponse, type NextRequest } from 'next/server';

import {
  clearTransactionCookie,
  safeErrorResponse,
  setSessionCookies,
  signedApiClient,
  transactionCookieName,
} from '../../../../../lib/server/bff';
import { serverEnvironment } from '../../../../../lib/server/environment';

const safeErrors = new Set([
  'access_denied',
  'temporarily_unavailable',
  'server_error',
  'interaction_required',
]);

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const code = request.nextUrl.searchParams.get('code') ?? undefined;
  const rawProviderError = request.nextUrl.searchParams.get('error') ?? undefined;
  const providerError =
    rawProviderError && safeErrors.has(rawProviderError) ? rawProviderError : undefined;
  const transactionToken = request.cookies.get(transactionCookieName())?.value ?? '';
  const body = {
    state,
    transactionToken,
    ...(code ? { code } : {}),
    ...(providerError ? { providerError } : {}),
  };
  try {
    const { data, error } = await signedApiClient('POST', '/auth/google/callback', body).POST(
      '/auth/google/callback',
      { body },
    );
    if (error || !data) {
      const redirect = NextResponse.redirect(
        `${serverEnvironment().webBaseUrl}/login?error=oauth_failed`,
        303,
      );
      clearTransactionCookie(redirect);
      return redirect;
    }
    const destination = data.returnTo ?? '/app';
    const redirect = NextResponse.redirect(`${serverEnvironment().webBaseUrl}${destination}`, 303);
    setSessionCookies(redirect, data);
    clearTransactionCookie(redirect);
    redirect.headers.set('cache-control', 'no-store');
    redirect.headers.set('referrer-policy', 'no-referrer');
    return redirect;
  } catch (error) {
    const failed = safeErrorResponse(error);
    clearTransactionCookie(failed);
    return failed;
  }
}
