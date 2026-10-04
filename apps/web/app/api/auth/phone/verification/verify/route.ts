import { NextResponse, type NextRequest } from 'next/server';
import {
  accessCookieName,
  requireMutationSecurity,
  safeErrorResponse,
  signedApiClient,
} from '../../../../../../lib/server/bff';
export async function POST(request: NextRequest) {
  try {
    const csrf = requireMutationSecurity(request);
    const token = request.cookies.get(accessCookieName())?.value;
    if (!token)
      return safeErrorResponse(
        {
          error: {
            code: 'SESSION_REFRESH_REQUIRED',
            message: 'Session refresh required',
            requestId: '',
          },
        },
        401,
      );
    const input = (await request.json()) as { challengeId?: unknown; code?: unknown };
    const body = {
      challengeId: typeof input.challengeId === 'string' ? input.challengeId : '',
      code: typeof input.code === 'string' ? input.code : '',
    };
    const headers = { authorization: `Bearer ${token}`, 'x-csrf-token': csrf };
    const { data, error, response } = await signedApiClient(
      'POST',
      '/auth/phone/verification/verify',
      body,
      headers,
    ).POST('/auth/phone/verification/verify', { body });
    if (error || !data) {
      const result = safeErrorResponse(error, response.status);
      const retry = response.headers.get('retry-after');
      if (retry && /^\d+$/.test(retry)) result.headers.set('retry-after', retry);
      return result;
    }
    return NextResponse.json(data, { headers: { 'cache-control': 'no-store, private' } });
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
