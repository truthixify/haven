import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Haven Protocol - Phala TEE Service
 *
 * This is the entry point for the Haven TEE NestJS service.
 * In production, this runs inside a Phala Network Intel TDX enclave.
 *
 * The TEE service is the ONLY component that handles sensitive data:
 * - OAuth tokens (Twitter, GitHub)
 * - Account linkages
 * - Raw activity data
 *
 * All sensitive data is stored in PostgreSQL running locally inside the TEE.
 * The TEE hardware protects the environment — no application-level encryption needed.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('HavenTEE');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // CORS: Allow dashboard to communicate with TEE
  app.enableCors({
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Haven-Identity'],
  });

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`Haven TEE Service running on port ${port}`);
  logger.log(`Network: ${process.env.CKB_NETWORK || 'testnet'}`);
  logger.log(`Database: PostgreSQL @ ${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'haven'}`);
  logger.log('Scoring scheduler: active');
}

bootstrap();
