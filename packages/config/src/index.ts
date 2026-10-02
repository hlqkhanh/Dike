import { z } from 'zod';

export const appEnvironmentSchema = z.enum(['local', 'test', 'staging', 'production']);
export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export function parseInteger(
  value: string | undefined,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw new Error(`Expected an integer between ${bounds.min} and ${bounds.max}`);
  }
  return parsed;
}

export function assertNonProduction(environment: AppEnvironment, action: string): void {
  if (environment === 'staging' || environment === 'production') {
    throw new Error(`${action} is disabled in ${environment}`);
  }
}
