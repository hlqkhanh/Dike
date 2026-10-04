import { type NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const headers = profileHeaders(request, false);
    const params = await context.params;
    if (!/^[a-f0-9]{24}$/i.test(params.userId)) return safeErrorResponse(undefined, 404);
    const body = undefined;
    const result = await signedApiClient('GET', `/users/${params.userId}`, body, headers).GET(
      '/users/{userId}',
      { params: { path: { userId: params.userId } } },
    );
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
