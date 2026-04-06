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
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TeeSessionGuard } from './guards/tee-session.guard';

/**
 * Auth Controller
 *
 * Handles OAuth flows for Twitter and GitHub.
 * Tokens are passed directly to TEE processing and stored
 * ONLY in sealed storage.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  // -----------------------------------------------------------------------
  // Twitter OAuth Flow
  // -----------------------------------------------------------------------

  /**
   * Initiate Twitter OAuth flow.
   * Redirects the user to Twitter for authorization.
   */
  @Get('twitter')
  @UseGuards(AuthGuard('twitter'))
  async twitterAuth(): Promise<void> {
    // Passport redirects to Twitter automatically
  }

  /**
   * Twitter OAuth callback.
   * Receives the token, seals it into TEE storage.
   */
  @Get('twitter/callback')
  @UseGuards(AuthGuard('twitter'))
  async twitterCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const twitterUser = req.user as any;
    const identityCommitment = req.query['state'] as string;

    if (!identityCommitment) {
      this.logger.warn('Twitter callback missing identity commitment state');
      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Missing identity commitment in OAuth state',
      });
      return;
    }

    const linked = await this.authService.linkTwitter(
      identityCommitment,
      twitterUser.twitterId,
      twitterUser.accessToken,
      twitterUser.refreshToken,
    );

    if (linked) {
      this.logger.log('Twitter account linked successfully');
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Twitter account linked. Tokens sealed in TEE storage.',
      });
    } else {
      res.status(HttpStatus.NOT_FOUND).json({
        error: 'Identity not found. Connect your CKB wallet first.',
      });
    }
  }

  // -----------------------------------------------------------------------
  // GitHub OAuth Flow
  // -----------------------------------------------------------------------

  /**
   * Initiate GitHub OAuth flow.
   * Redirects the user to GitHub for authorization.
   */
  @Get('github')
  @UseGuards(AuthGuard('github'))
  async githubAuth(): Promise<void> {
    // Passport redirects to GitHub automatically
  }

  /**
   * GitHub OAuth callback.
   * Receives the token, seals it into TEE storage.
   */
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const githubUser = req.user as any;
    const identityCommitment = req.query['state'] as string;

    if (!identityCommitment) {
      this.logger.warn('GitHub callback missing identity commitment state');
      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Missing identity commitment in OAuth state',
      });
      return;
    }

    const linked = await this.authService.linkGitHub(
      identityCommitment,
      githubUser.githubId,
      githubUser.accessToken,
    );

    if (linked) {
      this.logger.log('GitHub account linked successfully');
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'GitHub account linked. Token sealed in TEE storage.',
      });
    } else {
      res.status(HttpStatus.NOT_FOUND).json({
        error: 'Identity not found. Connect your CKB wallet first.',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Account Status
  // -----------------------------------------------------------------------

  /**
   * Check which accounts are linked for the authenticated user.
   * Returns booleans only - never exposes actual account IDs or tokens.
   */
  @Get('status')
  @HttpCode(HttpStatus.OK)
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

  /**
   * Unlink Twitter account.
   */
  @Post('twitter/unlink')
  @UseGuards(TeeSessionGuard)
  @HttpCode(HttpStatus.OK)
  async unlinkTwitter(@Req() req: Request): Promise<{ success: boolean }> {
    const identityCommitment = (req as any).identityCommitment as string;
    const success = await this.authService.unlinkTwitter(identityCommitment);
    return { success };
  }

  /**
   * Unlink GitHub account.
   */
  @Post('github/unlink')
  @UseGuards(TeeSessionGuard)
  @HttpCode(HttpStatus.OK)
  async unlinkGitHub(@Req() req: Request): Promise<{ success: boolean }> {
    const identityCommitment = (req as any).identityCommitment as string;
    const success = await this.authService.unlinkGitHub(identityCommitment);
    return { success };
  }
}
