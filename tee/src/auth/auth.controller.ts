import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TeeSessionGuard } from './guards/tee-session.guard';

/** In-memory PKCE code verifier store for Twitter OAuth 2.0 */
class TwitterStrategy {
  static pkceStore = new Map<string, string>();
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // -----------------------------------------------------------------------
  // Twitter OAuth Flow
  // -----------------------------------------------------------------------

  @Get('twitter')
  @ApiOperation({ summary: 'Start Twitter OAuth 2.0', description: 'Redirects the user to Twitter for authorization. Pass identity commitment as ?identity= query param.' })
  async twitterAuth(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const identity = req.query['identity'] as string || '';
    const clientId = this.config.get<string>('twitter.clientId', '');
    const callbackUrl = this.config.get<string>('twitter.callbackUrl', '');
    const scope = 'tweet.read users.read offline.access';

    // Generate PKCE code verifier and challenge
    const crypto = await import('crypto');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Store verifier temporarily (in-memory, keyed by state)
    const state = `${identity}:${crypto.randomBytes(8).toString('hex')}`;
    TwitterStrategy.pkceStore.set(state, codeVerifier);
    setTimeout(() => TwitterStrategy.pkceStore.delete(state), 600_000); // 10 min TTL

    const twitterAuthUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    res.redirect(twitterAuthUrl);
  }

  @Get('twitter/callback')
  @ApiExcludeEndpoint()
  async twitterCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const code = req.query['code'] as string;
    const state = req.query['state'] as string;

    if (!code || !state) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing code or state' });
      return;
    }

    const identityCommitment = state.split(':')[0];
    if (!identityCommitment) {
      this.logger.warn('Twitter callback missing identity commitment');
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing identity commitment' });
      return;
    }

    const codeVerifier = TwitterStrategy.pkceStore.get(state);
    if (!codeVerifier) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid or expired state' });
      return;
    }
    TwitterStrategy.pkceStore.delete(state);

    try {
      const { default: axios } = await import('axios');
      const clientId = this.config.get<string>('twitter.clientId', '');
      const clientSecret = this.config.get<string>('twitter.clientSecret', '');
      const callbackUrl = this.config.get<string>('twitter.callbackUrl', '');

      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenResponse = await axios.post(
        'https://api.twitter.com/2/oauth2/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
          code_verifier: codeVerifier,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
        },
      );

      const accessToken = tokenResponse.data?.access_token;
      const refreshToken = tokenResponse.data?.refresh_token;
      if (!accessToken) {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'Failed to get access token' });
        return;
      }

      // Get Twitter user profile
      const profileResponse = await axios.get('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const twitterId = profileResponse.data?.data?.id;

      const linked = await this.authService.linkTwitter(
        identityCommitment,
        twitterId,
        accessToken,
        refreshToken,
      );

      const dashboardUrl = 'https://haven-protocol.vercel.app';

      if (linked) {
        this.logger.log('Twitter account linked successfully');
        res.redirect(`${dashboardUrl}/identity?linked=twitter`);
      } else {
        res.redirect(`${dashboardUrl}/identity?error=identity_not_found`);
      }
    } catch (error: any) {
      const responseData = error?.response?.data;
      this.logger.error(`Twitter OAuth exchange failed: ${error?.response?.status} ${JSON.stringify(responseData)}`);
      res.redirect('https://haven-protocol.vercel.app/identity?error=oauth_failed');
    }
  }

  // -----------------------------------------------------------------------
  // GitHub OAuth Flow
  // -----------------------------------------------------------------------

  @Get('github')
  @ApiOperation({ summary: 'Start GitHub OAuth', description: 'Redirects the user to GitHub for authorization. Pass identity commitment as ?identity= query param.' })
  async githubAuth(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const identity = req.query['identity'] as string || '';
    const clientId = this.config.get<string>('github.clientId', '');
    const callbackUrl = this.config.get<string>('github.callbackUrl', '');
    const scope = 'read:user repo';
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(identity)}`;
    res.redirect(githubAuthUrl);
  }

  @Get('github/callback')
  @ApiExcludeEndpoint()
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const code = req.query['code'] as string;
    const identityCommitment = req.query['state'] as string;

    if (!identityCommitment) {
      this.logger.warn('GitHub callback missing identity commitment state');
      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Missing identity commitment in OAuth state',
      });
      return;
    }

    if (!code) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Missing code' });
      return;
    }

    // Exchange code for access token
    try {
      const { default: axios } = await import('axios');
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: this.config.get<string>('github.clientId', ''),
          client_secret: this.config.get<string>('github.clientSecret', ''),
          code,
          redirect_uri: this.config.get<string>('github.callbackUrl', ''),
        },
        { headers: { Accept: 'application/json' } },
      );

      const accessToken = tokenResponse.data?.access_token;
      if (!accessToken) {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'Failed to get access token' });
        return;
      }

      // Get GitHub user profile
      const profileResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const githubId = String(profileResponse.data?.id);

      const linked = await this.authService.linkGitHub(
        identityCommitment,
        githubId,
        accessToken,
      );

      const dashboardUrl = req.query['redirect'] as string || req.headers.origin || 'https://haven-protocol.vercel.app';

      if (linked) {
        this.logger.log('GitHub account linked successfully');
        res.redirect(`${dashboardUrl}/identity?linked=github`);
      } else {
        res.redirect(`${dashboardUrl}/identity?error=identity_not_found`);
      }
    } catch (error) {
      this.logger.error('GitHub OAuth exchange failed', error);
      const dashboardUrl = req.headers.origin || 'https://haven-protocol.vercel.app';
      res.redirect(`${dashboardUrl}/identity?error=oauth_failed`);
    }
  }

  // -----------------------------------------------------------------------
  // Account Status
  // -----------------------------------------------------------------------

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Account link status', description: 'Check which accounts (Twitter, GitHub, wallet) are linked for a given identity.' })
  @ApiQuery({ name: 'commitment', required: false, description: 'Identity commitment (or pass X-Haven-Identity header)' })
  @ApiOkResponse({ schema: { type: 'object', properties: { twitter: { type: 'boolean' }, github: { type: 'boolean' }, wallet: { type: 'boolean' } } } })
  async getAccountStatus(@Req() req: Request): Promise<{
    twitter: boolean;
    github: boolean;
    wallet: boolean;
  }> {
    // Accept identity from header or query param
    const identityCommitment =
      (req.headers['x-haven-identity'] as string) ||
      (req.query['commitment'] as string);
    if (!identityCommitment) {
      return { twitter: false, github: false, wallet: false };
    }
    return this.authService.getLinkedAccounts(identityCommitment);
  }

  @Post('twitter/unlink')
  @UseGuards(TeeSessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink Twitter', description: 'Remove the linked Twitter account. Requires TEE session.' })
  @ApiOkResponse({ schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async unlinkTwitter(@Req() req: Request): Promise<{ success: boolean }> {
    const identityCommitment = (req as any).identityCommitment as string;
    const success = await this.authService.unlinkTwitter(identityCommitment);
    return { success };
  }

  @Post('github/unlink')
  @UseGuards(TeeSessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink GitHub', description: 'Remove the linked GitHub account. Requires TEE session.' })
  @ApiOkResponse({ schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async unlinkGitHub(@Req() req: Request): Promise<{ success: boolean }> {
    const identityCommitment = (req as any).identityCommitment as string;
    const success = await this.authService.unlinkGitHub(identityCommitment);
    return { success };
  }
}
