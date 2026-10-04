import { type NextRequest } from 'next/server';
import {
  signedApiClient,
  safeErrorResponse,
  clearSessionCookies,
} from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function POST(request: NextRequest) {
  try {
    const headers = profileHeaders(request, true);

    const body = (await request.json()) as { confirmation: 'DELETE' };
    const result = await signedApiClient('POST', `/me/deletion`, body, headers).POST(
      '/me/deletion',
      { body },
    );
    const response = profileResponse(result);
    if (result.response.ok) clearSessionCookies(response);
    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
