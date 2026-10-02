import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { createApplication } from '../bootstrap.js';

const app = await createApplication({ mode: 'openapi' });
await app.init();
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle('Dike API').setVersion('0.1.0').addServer('/api/v1').build(),
  { ignoreGlobalPrefix: true },
);
await writeFile(
  resolve(import.meta.dirname, '../../openapi.json'),
  `${JSON.stringify(document, null, 2)}\n`,
);
await app.close();
