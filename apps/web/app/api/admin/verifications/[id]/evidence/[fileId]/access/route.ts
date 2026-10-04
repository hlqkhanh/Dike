import type { NextRequest } from 'next/server';
import type { components } from '@dike/api-client';
import {
  signedApiClient,
  safeErrorResponse,
  BffRequestError,
} from '../../../../../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../../../../../lib/server/profile-bff';
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const headers = profileHeaders(request, true);
    const { id, fileId } = await context.params;
    if (!/^[a-f0-9]{24}$/i.test(id) || !/^[a-f0-9]{24}$/i.test(fileId))
      throw new BffRequestError('INVALID_ID', 'Invalid resource', 400);
    const body = (await request.json()) as components['schemas']['EvidenceAccessDto'];
    const result = await signedApiClient(
      'POST',
      `/admin/verifications/${id}/evidence/${fileId}/access`,
      body,
      headers,
    ).POST('/admin/verifications/{id}/evidence/{fileId}/access', {
      body,
      params: { path: { id, fileId } },
    });
    return profileResponse(result);
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
