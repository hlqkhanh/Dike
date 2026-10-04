import { type NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function GET(request: NextRequest) {
  try {
    const headers = profileHeaders(request, false);

    const body = undefined;
    const result = await signedApiClient('GET', `/me/consents`, body, headers).GET(
      '/me/consents',
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
      policyVersion: string;
      termsAccepted: boolean;
      privacyAccepted: boolean;
      analytics: boolean;
    };
    const result = await signedApiClient('PUT', `/me/consents`, body, headers).PUT('/me/consents', {
      body,
    });
    const response = profileResponse(result);

    return response;
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
