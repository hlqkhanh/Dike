import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { RequestContext } from './common/request-context.js';
import { API_LOGGER } from './common/tokens.js';
import { loadApiConfig, openApiConfig, type ApiConfig } from './config/api-config.js';

export interface CreateApplicationOptions {
  mode: 'runtime' | 'test' | 'openapi';
  config?: ApiConfig;
}

export async function createApplication(
  options: CreateApplicationOptions,
): Promise<INestApplication> {
  const config = options.config ?? (options.mode === 'runtime' ? loadApiConfig() : openApiConfig());
  const app = await NestFactory.create(
    AppModule.register({ config, connectInfrastructure: options.mode === 'runtime' }),
    { abortOnError: false, bodyParser: false, logger: false },
  );
  app.use(json({ limit: '1mb' }));
  app.use(helmet());
  app.enableCors({
    origin: [config.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(app.get(RequestContext), app.get(API_LOGGER)));
  app.enableShutdownHooks();

  if (config.APP_ENV === 'local' || config.APP_ENV === 'test') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Dike API').setVersion('0.1.0').addServer('/api/v1').build(),
      { ignoreGlobalPrefix: true },
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
  }
  return app;
}
