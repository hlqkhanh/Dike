interface ServerEnvironment {
  appEnvironment: 'local' | 'test' | 'staging' | 'production';
  apiInternalUrl: string;
  webBaseUrl: string;
  bffActiveKeyId: string;
  bffKeys: Record<string, string>;
  secureCookies: boolean;
}

let cached: ServerEnvironment | undefined;

export function serverEnvironment(): ServerEnvironment {
  if (cached) return cached;
  const appEnvironment = process.env.APP_ENV ?? 'local';
  if (!['local', 'test', 'staging', 'production'].includes(appEnvironment)) {
    throw new Error('APP_ENV is invalid');
  }
  const apiInternalUrl = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001/api/v1')
    .toString()
    .replace(/\/$/, '');
  const webBaseUrl = new URL(process.env.WEB_BASE_URL ?? 'http://localhost:3000')
    .toString()
    .replace(/\/$/, '');
  const bffActiveKeyId = process.env.BFF_ACTIVE_KEY_ID ?? '';
  let bffKeys: Record<string, string>;
  try {
    bffKeys = JSON.parse(process.env.BFF_KEYRING ?? '{}') as Record<string, string>;
  } catch {
    throw new Error('BFF_KEYRING must be valid JSON');
  }
  if (!bffActiveKeyId || !bffKeys[bffActiveKeyId] || bffKeys[bffActiveKeyId].length < 32) {
    throw new Error('BFF keyring is invalid');
  }
  const secureCookies = appEnvironment === 'staging' || appEnvironment === 'production';
  if (secureCookies && !webBaseUrl.startsWith('https://')) {
    throw new Error('Hosted authentication requires HTTPS');
  }
  if (
    secureCookies &&
    /(replace|change|example|placeholder|test-secret|offline|012345)/i.test(bffKeys[bffActiveKeyId])
  ) {
    throw new Error('Hosted BFF keyring contains a placeholder secret');
  }
  cached = {
    appEnvironment: appEnvironment as ServerEnvironment['appEnvironment'],
    apiInternalUrl,
    webBaseUrl,
    bffActiveKeyId,
    bffKeys,
    secureCookies,
  };
  return cached;
}
