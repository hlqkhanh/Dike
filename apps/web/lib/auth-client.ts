'use client';

import type { AuthSessionView, DeviceSessionView } from '@dike/contracts';

let refreshPromise: Promise<AuthSessionView> | undefined;

export class ApiRequestError extends Error {
  constructor(
    code: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(code);
  }
}
export async function responseError(response: Response): Promise<ApiRequestError> {
  const retry = response.headers.get('retry-after');
  return new ApiRequestError(
    (await errorCode(response)) ?? 'REQUEST_FAILED',
    response.status,
    retry && /^\d+$/.test(retry) ? Number(retry) : undefined,
  );
}

function csrfCookie(): string {
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith('dike_csrf='))
    ?.slice('dike_csrf='.length);
  return value ? decodeURIComponent(value) : '';
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { error?: { code?: string } };
    return body.error?.code;
  } catch {
    return undefined;
  }
}

async function refreshSession(): Promise<AuthSessionView> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/session/refresh', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfCookie() },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await errorCode(response)) ?? 'SESSION_REFRESH_FAILED');
        return (await response.json()) as AuthSessionView;
      })
      .finally(() => {
        refreshPromise = undefined;
      });
  }
  return refreshPromise;
}

export async function loadSession(): Promise<AuthSessionView> {
  let response = await fetch('/api/auth/session', { cache: 'no-store' });
  if (response.status === 401 && (await errorCode(response)) === 'SESSION_REFRESH_REQUIRED') {
    await refreshSession();
    response = await fetch('/api/auth/session', { cache: 'no-store' });
  }
  if (!response.ok) return { authenticated: false };
  return (await response.json()) as AuthSessionView;
}

export async function authMutation<T>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const perform = () =>
    fetch(url, {
      method,
      headers: {
        'x-csrf-token': csrfCookie(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let response = await perform();
  if (response.status === 401 && (await errorCode(response)) === 'SESSION_REFRESH_REQUIRED') {
    await refreshSession();
    response = await perform();
  }
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function loadDeviceSessions(): Promise<DeviceSessionView[]> {
  const response = await fetch('/api/auth/sessions', { cache: 'no-store' });
  if (!response.ok) throw new Error((await errorCode(response)) ?? 'REQUEST_FAILED');
  return (await response.json()) as DeviceSessionView[];
}
