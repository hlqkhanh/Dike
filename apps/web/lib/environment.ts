export function publicApiUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value) return 'http://localhost:3001/api/v1';
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be a valid URL');
  }
}
