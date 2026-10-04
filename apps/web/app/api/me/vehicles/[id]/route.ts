import type { NextRequest } from 'next/server';
import type { components } from '@dike/api-client';
import { signedApiClient, safeErrorResponse, BffRequestError } from '../../../../../lib/server/bff';
import { profileHeaders, profileResponse } from '../../../../../lib/server/profile-bff';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const headers = profileHeaders(request, false);
    const { id } = await context.params;
    if (!/^[a-f0-9]{24}$/i.test(id))
      throw new BffRequestError('INVALID_ID', 'Invalid resource', 400);
    const body = undefined;
    const result = await signedApiClient('GET', `/me/vehicles/${id}`, body, headers).GET(
      '/me/vehicles/{id}',
      { params: { path: { id } } },
    );
    return profileResponse(result);
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const headers = profileHeaders(request, true);
    const { id } = await context.params;
    if (!/^[a-f0-9]{24}$/i.test(id))
      throw new BffRequestError('INVALID_ID', 'Invalid resource', 400);
    const body = (await request.json()) as components['schemas']['UpdateVehicleDto'];
    const result = await signedApiClient('PUT', `/me/vehicles/${id}`, body, headers).PUT(
      '/me/vehicles/{id}',
      { body, params: { path: { id } } },
    );
    return profileResponse(result);
  } catch (error) {
    return safeErrorResponse(error, 400);
  }
}
