import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as GitHubPassportStrategy } from 'passport-github2';

/**
 * GitHub OAuth 2.0 Strategy
 *
 * Handles the GitHub OAuth flow. The callback token is passed directly
 * to TEE processing. Tokens are stored ONLY in sealed storage, never
 * logged or persisted elsewhere.
 */
@Injectable()
export class GitHubStrategy extends PassportStrategy(
  GitHubPassportStrategy,
  'github',
) {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('github.clientId'),
      clientSecret: config.get<string>('github.clientSecret'),
      callbackURL: config.get<string>('github.callbackUrl'),
      scope: ['read:user', 'repo'],
    });
  }

  /**
   * Validate the GitHub OAuth callback.
   * Returns the user profile and tokens for sealed storage.
   *
   * IMPORTANT: These tokens must be sealed immediately and never logged.
   */
  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: any,
  ): Promise<any> {
    this.logger.debug('GitHub OAuth callback received');

    return {
      githubId: profile.id,
      githubUsername: profile.username,
      accessToken,
    };
  }
}
