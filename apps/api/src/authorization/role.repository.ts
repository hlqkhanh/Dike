import { Inject, Injectable } from '@nestjs/common';
import type { AccountRole } from '@dike/contracts';
import { Types, type Connection, type ClientSession } from 'mongoose';
import { MONGO_CONNECTION } from '../common/tokens.js';
import { ApiError } from '../common/api-error.js';
import type { UserDocument } from '../auth/auth.types.js';
import { TransactionManager } from '../database/transaction-manager.js';
import { effectiveRoles } from './role-policy.js';

export async function serializeAuthorization(connection: Connection, session: ClientSession) {
  const result = await connection
    .collection<{ _id: string; revision: number }>('authorization_revision')
    .updateOne({ _id: 'global' }, { $inc: { revision: 1 } }, { session });
  if (!result.matchedCount)
    throw new ApiError(
      'ROLE_OPERATION_FORBIDDEN',
      'Run database migrations before authorization operations',
      503,
    );
}

export async function protectLastAdmin(
  connection: Connection,
  user: UserDocument,
  session: ClientSession,
) {
  if (!effectiveRoles(user).includes('ADMIN')) return;
  const count = await connection
    .collection<UserDocument>('users')
    .countDocuments({ status: 'ACTIVE', phoneStatus: 'VERIFIED', roles: 'ADMIN' }, { session });
  if (count <= 1)
    throw new ApiError('ROLE_LAST_ADMIN', 'The last effective administrator must be retained', 409);
}

@Injectable()
export class RoleRepository {
  constructor(@Inject(MONGO_CONNECTION) private readonly connection: Connection) {}
  async list(userId: Types.ObjectId) {
    const user = await this.connection.collection<UserDocument>('users').findOne({ _id: userId });
    if (!user) throw new ApiError('ROLE_OPERATION_FORBIDDEN', 'Account unavailable', 403);
    return {
      userId: userId.toHexString(),
      roles: user.roles,
      effectiveRoles: effectiveRoles(user),
      roleVersion: user.roleVersion,
    };
  }
  async change(input: {
    userId: Types.ObjectId;
    actorId?: Types.ObjectId;
    role: AccountRole;
    operation: 'bootstrap' | 'grant' | 'revoke';
    reason: string;
  }) {
    if (
      !['ADMIN', 'MODERATOR'].includes(input.role) ||
      !input.reason.trim() ||
      input.reason.length > 200 ||
      !/^[a-zA-Z0-9._:/ -]+$/.test(input.reason)
    )
      throw new ApiError(
        'ROLE_OPERATION_FORBIDDEN',
        'A supported role and ticket reference are required',
        403,
      );
    return new TransactionManager(this.connection).run(async (session) => {
      await serializeAuthorization(this.connection, session);
      const users = this.connection.collection<UserDocument>('users');
      const target = await users.findOne({ _id: input.userId }, { session });
      if (!target || target.status !== 'ACTIVE' || target.phoneStatus !== 'VERIFIED')
        throw new ApiError(
          'ROLE_OPERATION_FORBIDDEN',
          'A verified active account is required',
          403,
        );
      if (input.operation === 'bootstrap') {
        if (
          input.role !== 'ADMIN' ||
          (await users.countDocuments(
            { status: 'ACTIVE', phoneStatus: 'VERIFIED', roles: 'ADMIN' },
            { session },
          ))
        )
          throw new ApiError(
            'ROLE_OPERATION_FORBIDDEN',
            'Administrator bootstrap is unavailable',
            403,
          );
      } else {
        const actor = input.actorId && (await users.findOne({ _id: input.actorId }, { session }));
        if (!actor || !effectiveRoles(actor).includes('ADMIN'))
          throw new ApiError(
            'ROLE_OPERATION_FORBIDDEN',
            'An effective administrator is required',
            403,
          );
      }
      if (input.operation === 'revoke' && input.role === 'ADMIN')
        await protectLastAdmin(this.connection, target, session);
      const roles =
        input.operation === 'revoke'
          ? target.roles.filter((role) => role !== input.role)
          : [...new Set([...target.roles, input.role])];
      await users.updateOne(
        { _id: target._id },
        { $set: { roles, updatedAt: new Date() }, $inc: { roleVersion: 1 } },
        { session },
      );
      await this.connection.collection('audit_logs').insertOne(
        {
          event: 'AUTH_ROLE_CHANGED',
          outcome: 'SUCCESS',
          userId: target._id,
          actorId: input.actorId,
          role: input.role,
          operation: input.operation,
          reason: input.reason.trim(),
          createdAt: new Date(),
        },
        { session },
      );
      return { roles };
    });
  }
}
