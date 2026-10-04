import { NextResponse, type NextRequest } from 'next/server';
import {
  accessCookieName,
  safeErrorResponse,
  signedApiClient,
} from '../../../../../lib/server/bff';
export async function GET(request: NextRequest) {
  try {
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
    const body = undefined;
    const headers = { authorization: `Bearer ${token}` };
    const { data, error, response } = await signedApiClient(
      'GET',
      '/auth/phone/verification',
      body,
      headers,
    ).GET('/auth/phone/verification', {});
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
