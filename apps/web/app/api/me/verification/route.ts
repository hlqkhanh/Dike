import type { NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function GET(request: NextRequest) {
  try {
    const headers = profileHeaders(request, false);
    const body = undefined;
    const result = await signedApiClient('GET', `/me/verification`, body, headers).GET(
      '/me/verification',
      {},
    );
    return profileResponse(result);
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
