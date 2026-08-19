import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SettingsService } from './modules/settings/settings.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 4000;
  const prefix = config.get<string>('apiPrefix') ?? 'api';
  const isProduction = config.get<string>('env') === 'production';

  app.setGlobalPrefix(prefix);

  // The API is consumed by a separate origin (Next.js) and never renders HTML,
  // so CSP and cross-origin embedding protections are handled at that layer.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string[]>('corsOrigins') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown keys instead of trusting them, and reject payloads that
      // try to set fields the DTO does not declare.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CARE Workflow API')
      .setDescription(
        'CARE workflow, task tracking and accountability platform. ' +
          'Every endpoint returns { success, data, meta? }; errors return { success: false, error }.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(prefix + '/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Seed the settings table on first boot so the admin panel is never empty.
  await app.get(SettingsService).ensureDefaults();

  await app.listen(port, '0.0.0.0');
  logger.log('CARE Workflow API listening on http://localhost:' + port + '/' + prefix);
  if (!isProduction) {
    logger.log('API documentation: http://localhost:' + port + '/' + prefix + '/docs');
  }
}

void bootstrap();
