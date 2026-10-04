import type { Connection } from 'mongoose';
export const stage5Migration = {
  id: '20261004-005-sandbox-workflows',
  description: 'Add sandbox verification, vehicles, communities, inbox and command indexes',
  signature: 'sandbox-workflows-v1',
  async apply(connection: Connection) {
    await connection.collection('users').updateMany(
      { identityStatus: { $exists: false } },
      {
        $set: {
          identityStatus: 'NOT_SUBMITTED',
          identityMode: 'SANDBOX',
          approvedVehicleCount: 0,
        },
      },
    );
    await connection.collection('users').updateMany({}, [
      {
        $set: {
          roles: {
            $setDifference: [
              { $ifNull: ['$roles', ['MEMBER']] },
              ['VERIFIED_MEMBER', 'APPROVED_DRIVER'],
            ],
          },
        },
      },
    ]);
    await connection.collection('verification_applications').createIndexes([
      { key: { userId: 1, attempt: 1 }, unique: true, name: 'verification_attempt' },
      {
        key: { userId: 1 },
        unique: true,
        partialFilterExpression: { active: true },
        name: 'verification_one_active',
      },
      { key: { status: 1, expiresAt: 1 }, name: 'verification_expiry' },
    ]);
    await connection.collection('vehicles').createIndexes([
      { key: { userId: 1, status: 1 }, name: 'vehicle_owner' },
      {
        key: { syntheticPlate: 1 },
        unique: true,
        partialFilterExpression: {
          status: { $in: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] },
        },
        name: 'vehicle_plate_active',
      },
    ]);
    await connection
      .collection('communities')
      .createIndex({ slug: 1 }, { unique: true, name: 'community_slug' });
    await connection.collection('community_memberships').createIndexes([
      { key: { communityId: 1, userId: 1 }, unique: true, name: 'membership_pair' },
      { key: { userId: 1, status: 1 }, name: 'membership_user' },
    ]);
    for (const name of [
      'verification_applications',
      'vehicles',
      'community_memberships',
      'communities',
    ])
      await connection
        .collection(name)
        .createIndex({ status: 1, _id: -1 }, { name: 'review_queue' });
    await connection.collection('webhook_events').createIndexes([
      { key: { provider: 1, eventId: 1 }, unique: true, name: 'webhook_event' },
      { key: { processingStatus: 1, receivedAt: 1 }, name: 'webhook_pending' },
      { key: { purgeAt: 1 }, expireAfterSeconds: 0, name: 'webhook_retention' },
    ]);
    await connection.collection('workflow_commands').createIndexes([
      { key: { actorId: 1, commandId: 1 }, unique: true, name: 'workflow_command' },
      { key: { purgeAt: 1 }, expireAfterSeconds: 0, name: 'command_retention' },
    ]);
    await connection
      .collection('files')
      .createIndex({ resourceId: 1, resourceType: 1 }, { name: 'file_resource' });
    await connection
      .collection('audit_logs')
      .createIndex({ resourceType: 1, resourceId: 1, _id: -1 }, { name: 'audit_resource' });
  },
};
