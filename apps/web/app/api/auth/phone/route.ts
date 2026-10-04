import { NextResponse, type NextRequest } from 'next/server';

import {
  accessCookieName,
  requireMutationSecurity,
  safeErrorResponse,
  signedApiClient,
} from '../../../../lib/server/bff';

export async function PUT(request: NextRequest) {
  try {
    const csrf = requireMutationSecurity(request);
    const accessToken = request.cookies.get(accessCookieName())?.value;
    if (!accessToken) return safeErrorResponse(undefined, 401);
    const input = (await request.json()) as { phone?: unknown };
    const body = { phone: typeof input.phone === 'string' ? input.phone : '' };
    const headers = { authorization: `Bearer ${accessToken}`, 'x-csrf-token': csrf };
    const { data, error } = await signedApiClient('PUT', '/auth/phone', body, headers).PUT(
      '/auth/phone',
      { body },
    );
    if (error || !data) return safeErrorResponse(error);
    return NextResponse.json(data, { headers: { 'cache-control': 'no-store, private' } });
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
