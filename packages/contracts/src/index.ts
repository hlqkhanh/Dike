import { z } from 'zod';

export const REQUEST_ID_HEADER = 'x-request-id' as const;
export const FOUNDATION_QUEUE = 'foundation-events' as const;
export const FOUNDATION_SAMPLE_EVENT = 'foundation.sample.requested.v1' as const;
export const BFF_KEY_ID_HEADER = 'x-dike-bff-key-id' as const;
export const BFF_TIMESTAMP_HEADER = 'x-dike-bff-timestamp' as const;
export const BFF_NONCE_HEADER = 'x-dike-bff-nonce' as const;
export const BFF_SIGNATURE_HEADER = 'x-dike-bff-signature' as const;
export const CSRF_HEADER = 'x-csrf-token' as const;

export const accountRoleSchema = z.enum([
  'MEMBER',
  'VERIFIED_MEMBER',
  'APPROVED_DRIVER',
  'MODERATOR',
  'ADMIN',
]);
export type AccountRole = z.infer<typeof accountRoleSchema>;
export interface PhoneOtpChallengeView {
  challengeId: string;
  destinationMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsRemaining: number;
  developmentCode?: string;
}
export interface PhoneVerificationView {
  phoneStatus: PhoneStatus;
  challenge: PhoneOtpChallengeView | null;
}
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
    roles: AccountRole[];
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
  'OTP_NOT_CONFIGURED',
  'OTP_PROVIDER_UNAVAILABLE',
  'OTP_CHALLENGE_NOT_FOUND',
  'OTP_CHALLENGE_EXPIRED',
  'OTP_CODE_INVALID',
  'OTP_ATTEMPTS_EXHAUSTED',
  'OTP_RESEND_TOO_SOON',
  'OTP_ALREADY_VERIFIED',
  'PHONE_CHANGED',
  'PHONE_ALREADY_IN_USE',
  'ROLE_REQUIRED',
  'ROLE_OPERATION_FORBIDDEN',
  'ROLE_LAST_ADMIN',
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

export const POLICY_VERSION = '2026-10-04-draft' as const;
export const privacySettingsSchema = z.object({
  profileVisibility: z.enum(['MEMBERS', 'PRIVATE']),
  discoverable: z.boolean(),
  directMessages: z.enum(['NONE', 'FRIENDS', 'MEMBERS']),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;
export const DEFAULT_PRIVACY: PrivacySettings = {
  profileVisibility: 'MEMBERS',
  discoverable: false,
  directMessages: 'NONE',
};
export interface ProfileView {
  id: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  phoneVerified: boolean;
}
export interface ConsentView {
  policyVersion: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  analytics: boolean;
}
export interface FileView {
  id: string;
  purpose: 'AVATAR' | 'VERIFICATION_SANDBOX';
  status: string;
  createdAt: string;
  expiresAt: string;
  publicUrl: string | null;
}
export interface UploadView {
  fileId: string;
  uploadUrl: string;
  contentType: string;
  size: number;
  expiresAt: string;
}
export interface FileRecord<Id> {
  _id: Id;
  ownerId: Id;
  purpose: 'AVATAR' | 'VERIFICATION_SANDBOX';
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'DELETE_PENDING' | 'DELETED';
  uploadKey: string;
  finalKey: string;
  contentType: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  uploadExpiresAt: Date;
  deleteAfter?: Date;
  lockToken?: string;
  lockedUntil?: Date;
  finalizedAt?: Date;
}
