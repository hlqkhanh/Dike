import { NextResponse } from 'next/server';

import { plainApiClient, safeErrorResponse } from '../../../lib/server/bff';

export async function GET() {
  try {
    const { data, error, response } = await plainApiClient().GET('/health/ready');
    if (error || !data) return safeErrorResponse(error, response.status);
    return NextResponse.json(data, {
      status: response.status,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
