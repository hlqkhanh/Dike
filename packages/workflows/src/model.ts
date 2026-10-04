import type { Types } from 'mongoose';
import type { AccountRole } from '@dike/contracts';
export const EKYC_EVENT = 'ekyc.callback.received.v1';
export const EKYC_DELIVERY = 'ekyc.mock.delivery.v1';
export type Kind = 'verification' | 'vehicle' | 'membership' | 'community';
export const collections = {
  verification: 'verification_applications',
  vehicle: 'vehicles',
  membership: 'community_memberships',
  community: 'communities',
} as const;
export interface Actor {
  _id: Types.ObjectId;
  status: string;
  phoneStatus: string;
  roles: AccountRole[];
  identityStatus?: string;
  identityMode?: string;
  approvedVehicleCount?: number;
}
export interface RecordDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  evidenceFileIds: Types.ObjectId[];
  mode?: 'SANDBOX';
  active?: boolean;
  attempt?: number;
  providerRef?: string;
  expiresAt?: Date;
  decision?: { action: string; reason: string; actorId: Types.ObjectId; at: Date };
  type?: string;
  model?: string;
  color?: string;
  syntheticPlate?: string;
  passengerCapacity?: number;
  communityId?: Types.ObjectId;
  requestReason?: string;
  cooldownUntil?: Date;
  slug?: string;
  name?: string;
  description?: string;
}
export interface CallbackEvent {
  _id: Types.ObjectId;
  provider: 'mock';
  eventId: string;
  applicationId: Types.ObjectId;
  providerRef: string;
  attempt: number;
  result: 'PASS' | 'FAIL' | 'EXPIRED';
  payloadHash: string;
  processingStatus: 'PENDING' | 'PROCESSED' | 'IGNORED';
  receivedAt: Date;
  purgeAt: Date;
}
export class WorkflowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}
export function demand(condition: unknown, code: string, status = 409): asserts condition {
  if (!condition) throw new WorkflowError(code, code.replaceAll('_', ' ').toLowerCase(), status);
}
export function isAdmin(user: Actor) {
  return (
    user.status === 'ACTIVE' && user.phoneStatus === 'VERIFIED' && user.roles.includes('ADMIN')
  );
}
export function verified(user: Actor) {
  return (
    user.status === 'ACTIVE' &&
    user.phoneStatus === 'VERIFIED' &&
    user.identityStatus === 'VERIFIED' &&
    user.identityMode === 'SANDBOX'
  );
}
export function canPublishNeed(user: Actor) {
  return verified(user);
}
export function canCreateTripWithVehicle(user: Actor, vehicle: RecordDocument) {
  return verified(user) && vehicle.userId.equals(user._id) && vehicle.status === 'APPROVED';
}
export function view(record: RecordDocument, reviewer = false) {
  return {
    id: record._id.toHexString(),
    status: record.status,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    evidenceFileIds: record.evidenceFileIds.map(String),
    ...(reviewer ? { userId: record.userId.toHexString() } : {}),
    mode: record.mode,
    attempt: record.attempt,
    expiresAt: record.expiresAt?.toISOString(),
    reason: record.decision?.reason,
    type: record.type,
    model: record.model,
    color: record.color,
    syntheticPlate: record.syntheticPlate,
    passengerCapacity: record.passengerCapacity,
    communityId: record.communityId?.toHexString(),
    requestReason: record.requestReason,
    cooldownUntil: record.cooldownUntil?.toISOString(),
    slug: record.slug,
    name: record.name,
    description: record.description,
  };
}
