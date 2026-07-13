import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // rawBody is needed for Stripe webhook signature verification.
    rawBody: true,
  });

  app.useLogger(app.get(PinoLogger));
  const config = app.get(ConfigService);

  // Security headers.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  // `rawBody: true` (NestFactory) exposes req.rawBody for Stripe webhook
  // signature verification while normal JSON parsing continues to work.

  // Strict CORS allowlist with credentials (httpOnly cookies).
  const origins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('api');

  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  app.get(PinoLogger).log(`Marhaba API listening on :${port}`);
}

void bootstrap();
