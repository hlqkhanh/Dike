import { type NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../../lib/server/profile-bff';
export async function POST(request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  try {
    const headers = profileHeaders(request, true);
    const params = await context.params;
    if (!/^[a-f0-9]{24}$/i.test(params.fileId)) return safeErrorResponse(undefined, 404);
    const body = undefined;
    const result = await signedApiClient(
      'POST',
      `/files/${params.fileId}/complete`,
      body,
      headers,
    ).POST('/files/{fileId}/complete', { params: { path: { fileId: params.fileId } } });
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
