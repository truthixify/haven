import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('HavenTEE');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // CORS: Allow dashboard to communicate with TEE
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Haven-Identity'],
  });

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Haven Protocol TEE API')
    .setDescription(
      'Phala TEE service for Haven Protocol. Handles identity registration, ' +
      'OAuth account linking, score computation, DCAP attestation, ' +
      'SP1 proof requests, and CKB transaction submission.',
    )
    .setVersion('0.1.0')
    .addApiKey(
      { type: 'apiKey', name: 'X-Haven-Identity', in: 'header' },
      'identity',
    )
    .addTag('Health', 'TEE runtime status')
    .addTag('Identity', 'CKB wallet verification and identity management')
    .addTag('Auth', 'OAuth account linking (Twitter, GitHub)')
    .addTag('Notifications', 'User notification management')
    .addTag('Admin', 'Admin operations (testing only)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`Haven TEE Service running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/docs`);
  logger.log(`Network: ${process.env.CKB_NETWORK || 'testnet'}`);
}

bootstrap();
