import 'reflect-metadata';

import { createApplication } from './bootstrap.js';
import { loadApiConfig } from './config/api-config.js';

const config = loadApiConfig();
const app = await createApplication({ mode: 'runtime', config });
await app.listen(config.API_PORT, '127.0.0.1');
