import type { NextRequest } from 'next/server';
import type { components } from '@dike/api-client';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function POST(request: NextRequest) {
  try {
    const headers = profileHeaders(request, true);
    const body = (await request.json()) as components['schemas']['CreateCommandDto'];
    const result = await signedApiClient('POST', `/verification/applications`, body, headers).POST(
      '/verification/applications',
      { body },
    );
    return profileResponse(result);
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
