import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as TwitterOAuth2Strategy } from '@superfaceai/passport-twitter-oauth2';

/**
 * Twitter OAuth 2.0 Strategy
 *
 * Handles the Twitter OAuth 2.0 flow with PKCE.
 * Tokens are stored ONLY in sealed storage, never logged or persisted elsewhere.
 */
@Injectable()
export class TwitterStrategy extends PassportStrategy(
  TwitterOAuth2Strategy,
  'twitter',
) {
  private readonly logger = new Logger(TwitterStrategy.name);

  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('twitter.clientId'),
      clientSecret: config.get<string>('twitter.clientSecret'),
      callbackURL: config.get<string>('twitter.callbackUrl'),
      clientType: 'confidential',
      scope: ['tweet.read', 'users.read', 'offline.access'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    this.logger.debug('Twitter OAuth 2.0 callback received');

    return {
      twitterId: profile.id,
      twitterUsername: profile.username,
      accessToken,
      refreshToken,
    };
  }
}
