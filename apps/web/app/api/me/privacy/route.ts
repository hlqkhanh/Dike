import { type NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function GET(request: NextRequest) {
  try {
    const headers = profileHeaders(request, false);

    const body = undefined;
    const result = await signedApiClient('GET', `/me/privacy`, body, headers).GET(
      '/me/privacy',
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

    const body = (await request.json()) as {
      profileVisibility: 'MEMBERS' | 'PRIVATE';
      discoverable: boolean;
      directMessages: 'NONE' | 'FRIENDS' | 'MEMBERS';
    };
    const result = await signedApiClient('PUT', `/me/privacy`, body, headers).PUT('/me/privacy', {
      body,
    });
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
