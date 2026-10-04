import { type NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function GET(request: NextRequest) {
  try {
    const headers = profileHeaders(request, false);

    const body = undefined;
    const result = await signedApiClient('GET', `/me/profile`, body, headers).GET(
      '/me/profile',
      {},
    );
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
export async function PUT(request: NextRequest) {
  try {
    const headers = profileHeaders(request, true);

    const body = (await request.json()) as { displayName: string; bio: string };
    const result = await signedApiClient('PUT', `/me/profile`, body, headers).PUT('/me/profile', {
      body,
    });
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
