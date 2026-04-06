import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as TwitterPassportStrategy } from 'passport-twitter';

/**
 * Twitter OAuth 1.0a Strategy
 *
 * Handles the Twitter OAuth flow. The callback token is passed directly
 * to TEE processing. Tokens are stored ONLY in sealed storage, never
 * logged or persisted elsewhere.
 */
@Injectable()
export class TwitterStrategy extends PassportStrategy(
  TwitterPassportStrategy,
  'twitter',
) {
  private readonly logger = new Logger(TwitterStrategy.name);

  constructor(private readonly config: ConfigService) {
    super({
      consumerKey: config.get<string>('twitter.clientId'),
      consumerSecret: config.get<string>('twitter.clientSecret'),
      callbackURL: config.get<string>('twitter.callbackUrl'),
      includeEmail: false,
      includeStatus: false,
    });
  }

  /**
   * Validate the Twitter OAuth callback.
   * Returns the user profile and tokens for sealed storage.
   *
   * IMPORTANT: These tokens must be sealed immediately and never logged.
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    this.logger.debug('Twitter OAuth callback received');

    return {
      twitterId: profile.id,
      twitterUsername: profile.username,
      accessToken,
      refreshToken,
    };
  }
}
