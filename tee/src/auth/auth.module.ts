import { Module, Logger } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwitterStrategy } from './strategies/twitter.strategy';
import { GitHubStrategy } from './strategies/github.strategy';
import { TeeSessionGuard } from './guards/tee-session.guard';

const logger = new Logger('AuthModule');

/**
 * Conditionally provide OAuth strategies only when keys are configured.
 * This prevents the app from crashing when OAuth credentials aren't set.
 */
const conditionalProviders = [
  {
    provide: 'TWITTER_STRATEGY',
    useFactory: (config: ConfigService) => {
      const clientId = config.get<string>('twitter.clientId');
      if (clientId) {
        return new TwitterStrategy(config);
      }
      logger.warn('Twitter OAuth not configured — skipping TwitterStrategy');
      return null;
    },
    inject: [ConfigService],
  },
  {
    provide: 'GITHUB_STRATEGY',
    useFactory: (config: ConfigService) => {
      const clientId = config.get<string>('github.clientId');
      if (clientId) {
        return new GitHubStrategy(config);
      }
      logger.warn('GitHub OAuth not configured — skipping GitHubStrategy');
      return null;
    },
    inject: [ConfigService],
  },
];

@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [AuthService, TeeSessionGuard, ...conditionalProviders],
  exports: [AuthService, TeeSessionGuard],
})
export class AuthModule {}
