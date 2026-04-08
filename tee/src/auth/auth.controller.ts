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
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TeeSessionGuard } from './guards/tee-session.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  // -----------------------------------------------------------------------
  // Twitter OAuth Flow
  // -----------------------------------------------------------------------

  @Get('twitter')
  @UseGuards(AuthGuard('twitter'))
  @ApiOperation({ summary: 'Start Twitter OAuth', description: 'Redirects the user to Twitter for authorization.' })
  async twitterAuth(): Promise<void> {
    // Passport redirects to Twitter automatically
  }

  @Get('twitter/callback')
  @UseGuards(AuthGuard('twitter'))
  @ApiExcludeEndpoint()
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

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Start GitHub OAuth', description: 'Redirects the user to GitHub for authorization.' })
  async githubAuth(): Promise<void> {
    // Passport redirects to GitHub automatically
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiExcludeEndpoint()
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
