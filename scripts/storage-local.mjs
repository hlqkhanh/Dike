import { ObjectStorage, storageConfigSchema } from '@dike/storage';
import { ensureLocalEnvironment } from './local-env.mjs';
process.loadEnvFile(ensureLocalEnvironment());
if (!['local', 'test'].includes(process.env.APP_ENV ?? 'local'))
  throw new Error('Storage setup is local/test only');
const storage = new ObjectStorage(storageConfigSchema.parse(process.env));
try {
  await storage.configureLocal();
  console.log('[storage] Configured quarantine expiry; MinIO CORS is configured by Compose.');
} finally {
  storage.close();
}
