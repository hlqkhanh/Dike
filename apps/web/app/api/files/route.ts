import { type NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../lib/server/profile-bff';
export async function GET(request: NextRequest) {
  try {
    const headers = profileHeaders(request, false);

    const body = undefined;
    const result = await signedApiClient('GET', `/files`, body, headers).GET('/files', {});
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
