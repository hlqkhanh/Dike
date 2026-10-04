import { z } from 'zod';

export const REQUEST_ID_HEADER = 'x-request-id' as const;
export const FOUNDATION_QUEUE = 'foundation-events' as const;
export const FOUNDATION_SAMPLE_EVENT = 'foundation.sample.requested.v1' as const;
export const BFF_KEY_ID_HEADER = 'x-dike-bff-key-id' as const;
export const BFF_TIMESTAMP_HEADER = 'x-dike-bff-timestamp' as const;
export const BFF_NONCE_HEADER = 'x-dike-bff-nonce' as const;
export const BFF_SIGNATURE_HEADER = 'x-dike-bff-signature' as const;
export const CSRF_HEADER = 'x-csrf-token' as const;

export const phoneStatusSchema = z.enum(['NONE', 'UNVERIFIED', 'VERIFIED']);
export type PhoneStatus = z.infer<typeof phoneStatusSchema>;

export const onboardingNextActionSchema = z.enum([
  'PHONE_REQUIRED',
  'PHONE_VERIFICATION_REQUIRED',
  'NONE',
]);
export type OnboardingNextAction = z.infer<typeof onboardingNextActionSchema>;

export const deviceSummarySchema = z.object({
  browser: z.string().max(80),
  operatingSystem: z.string().max(80),
  deviceType: z.enum(['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN']),
});
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;

export interface AuthenticatedSessionView {
  authenticated: true;
  csrfToken: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    phoneStatus: PhoneStatus;
    maskedPhone: string | null;
  };
  session: {
    id: string;
    current: true;
    createdAt: string;
    lastSeenAt: string;
    accessExpiresAt: string;
    absoluteExpiresAt: string;
    device: DeviceSummary;
  };
  onboarding: { nextAction: OnboardingNextAction };
}

export interface AnonymousSessionView {
  authenticated: false;
}

export type AuthSessionView = AuthenticatedSessionView | AnonymousSessionView;

export interface DeviceSessionView {
  id: string;
  current: boolean;
  device: DeviceSummary;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
}

export const authErrorCodes = [
  'OAUTH_TRANSACTION_EXPIRED',
  'OAUTH_STATE_INVALID',
  'OAUTH_PROVIDER_DENIED',
  'OAUTH_CODE_INVALID',
  'IDENTITY_TOKEN_INVALID',
  'ACCOUNT_LINK_REVIEW_REQUIRED',
  'SESSION_REQUIRED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_REFRESH_REQUIRED',
  'SESSION_REFRESHED',
  'REFRESH_TOKEN_REUSED',
  'CSRF_INVALID',
  'ORIGIN_NOT_ALLOWED',
  'PHONE_INVALID',
  'RATE_LIMITED',
  'INTERNAL_CLIENT_UNAUTHORIZED',
] as const;
export type AuthErrorCode = (typeof authErrorCodes)[number];

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: ApiErrorDetail[];
  };
}

export interface DependencyHealth {
  status: 'up' | 'down';
}

export interface HealthResponse {
  status: 'ok' | 'unavailable';
  requestId: string;
  dependencies?: Record<string, DependencyHealth>;
}

export const foundationSampleJobSchema = z.object({
  eventId: z.uuid(),
  requestedAt: z.iso.datetime(),
  message: z.string().trim().min(1).max(200),
});

export type FoundationSampleJob = z.infer<typeof foundationSampleJobSchema>;
