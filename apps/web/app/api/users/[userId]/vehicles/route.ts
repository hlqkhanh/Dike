import type { NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse, BffRequestError } from '../../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../../lib/server/profile-bff';
export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const headers = profileHeaders(request, false);
    const { userId } = await context.params;
    if (!/^[a-f0-9]{24}$/i.test(userId))
      throw new BffRequestError('INVALID_ID', 'Invalid resource', 400);
    const body = undefined;
    const result = await signedApiClient('GET', `/users/${userId}/vehicles`, body, headers).GET(
      '/users/{userId}/vehicles',
      { params: { path: { userId } } },
    );
    return profileResponse(result);
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
