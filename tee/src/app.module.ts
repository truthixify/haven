import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { UserEntity } from './storage/entities/user.entity';
import { ConnectionEntity } from './storage/entities/connection.entity';
import { NotificationEntity } from './notifications/notification.entity';
import { ScoreHistoryEntity } from './storage/entities/score-history.entity';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { IdentityModule } from './identity/identity.module';
import { ScoringModule } from './scoring/scoring.module';
import { AttestationModule } from './attestation/attestation.module';
import { ChainModule } from './chain/chain.module';
import { NotificationModule } from './notifications/notification.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';

const logger = new Logger('AppModule');

/**
 * Haven TEE Service - Root Application Module
 *
 * The Phala TEE is the heart of Haven Protocol. This NestJS service
 * runs inside the TEE enclave and handles:
 *
 * - Account connection (Twitter OAuth, GitHub OAuth, CKB wallet)
 * - Identity commitment generation
 * - Activity collection from connected platforms
 * - Haven Score computation using the scoring engine
 * - DCAP attestation generation
 * - SP1 proof requests
 * - CKB transaction building and submission
 *
 * There is no traditional backend. The TEE IS the backend.
 */
@Module({
  imports: [
    // Configuration from environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // PostgreSQL via TypeORM (runs locally inside TEE container)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('database.host', 'localhost');
        const port = config.get<number>('database.port', 5432);

        logger.log(`Connecting to PostgreSQL at ${host}:${port}`);

        return {
          type: 'postgres',
          host,
          port,
          database: config.get<string>('database.name', 'haven'),
          username: config.get<string>('database.user', 'haven'),
          password: config.get<string>('database.password', 'haven_tee_secret'),
          entities: [UserEntity, ConnectionEntity, NotificationEntity, ScoreHistoryEntity],
          synchronize: true,
          // Retry connection on startup so the app doesn't crash
          // if Postgres takes a moment to start
          retryAttempts: 5,
          retryDelay: 3000,
        };
      },
    }),

    // Cron scheduling for 24-hour scoring cycles
    ScheduleModule.forRoot(),

    // Database storage (global - available to all modules)
    StorageModule,

    // OAuth and session management
    AuthModule,

    // CKB wallet verification and identity commitment
    IdentityModule,

    // Scoring engine, collectors, formulas, scheduler
    ScoringModule,

    // DCAP attestation and SP1 proof worker client
    AttestationModule,

    // CKB transaction building, cell serialization, registry
    ChainModule,

    // User notification management
    NotificationModule,

    // Health / status endpoint
    HealthModule,

    // Admin operations (testing only — remove before production)
    AdminModule,
  ],
})
export class AppModule {}
