import { type NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function POST(request: NextRequest) {
  try {
    const headers = profileHeaders(request, true);

    const body = (await request.json()) as {
      purpose: 'AVATAR' | 'VERIFICATION_SANDBOX';
      contentType: 'image/jpeg' | 'image/png' | 'image/webp';
      size: number;
    };
    const result = await signedApiClient('POST', `/files/uploads`, body, headers).POST(
      '/files/uploads',
      { body },
    );
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
