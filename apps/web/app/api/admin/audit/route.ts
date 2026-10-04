import type { NextRequest } from 'next/server';
import { signedApiClient, safeErrorResponse } from '../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../lib/server/profile-bff';
export async function GET(request: NextRequest) {
  try {
    const headers = profileHeaders(request, false);
    const body = undefined;
    const search = request.nextUrl.searchParams;
    const result = await signedApiClient('GET', `/admin/audit`, body, headers).GET('/admin/audit', {
      params: {
        query: {
          ...(search.has('cursor') ? { cursor: search.get('cursor')! } : {}),
          ...(search.has('limit') ? { limit: Number(search.get('limit')) } : {}),
          resourceType: search.get('resourceType') as
            | 'verification'
            | 'vehicle'
            | 'membership'
            | 'community',
          resourceId: search.get('resourceId') ?? '',
        },
      },
    });
    return profileResponse(result);
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
