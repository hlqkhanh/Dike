import { NextResponse, type NextRequest } from 'next/server';

import { accessCookieName, safeErrorResponse, signedApiClient } from '../../../lib/server/bff';

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get(accessCookieName())?.value;
    if (!accessToken) return safeErrorResponse(undefined, 401);
    const headers = { authorization: `Bearer ${accessToken}` };
    const { data, error } = await signedApiClient('GET', '/me', undefined, headers).GET('/me');
    if (error || !data) return safeErrorResponse(error);
    return NextResponse.json(data, { headers: { 'cache-control': 'no-store, private' } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
