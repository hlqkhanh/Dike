import mongoose, { Types } from 'mongoose';
import { loadApiConfig } from '../config/api-config.js';
import { RoleRepository } from './role.repository.js';
import { ApiError } from '../common/api-error.js';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const operation = args.shift();
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
async function main() {
  const config = loadApiConfig();
  const userId = value('--user-id');
  if (!userId || !Types.ObjectId.isValid(userId)) throw new Error('A valid --user-id is required');
  if (!['list', 'bootstrap-admin', 'grant', 'revoke'].includes(operation ?? ''))
    throw new Error('Unknown role operation');
  const mutating = operation !== 'list';
  if (
    mutating &&
    (operation === 'bootstrap-admin' ||
      config.APP_ENV === 'production' ||
      config.APP_ENV === 'staging') &&
    !args.includes('--confirm')
  )
    throw new Error('--confirm is required');
  const connection = await mongoose
    .createConnection(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  try {
    const repository = new RoleRepository(connection);
    if (operation === 'list') {
      process.stdout.write(JSON.stringify(await repository.list(new Types.ObjectId(userId))));
      return;
    }
    const actorId = value('--actor-id');
    const role = operation === 'bootstrap-admin' ? 'ADMIN' : value('--role');
    if (role !== 'ADMIN' && role !== 'MODERATOR')
      throw new Error('Only ADMIN and MODERATOR may be managed');
    if (operation !== 'bootstrap-admin' && (!actorId || !Types.ObjectId.isValid(actorId)))
      throw new Error('A valid --actor-id is required');
    process.stdout.write(
      JSON.stringify(
        await repository.change({
          userId: new Types.ObjectId(userId),
          ...(actorId ? { actorId: new Types.ObjectId(actorId) } : {}),
          role,
          operation:
            operation === 'bootstrap-admin' ? 'bootstrap' : (operation as 'grant' | 'revoke'),
          reason: value('--reason') ?? '',
        }),
      ),
    );
  } finally {
    await connection.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof ApiError
      ? error.code
      : 'Role operation failed. Check arguments, configuration and database readiness.',
  );
  process.exitCode = 1;
});
