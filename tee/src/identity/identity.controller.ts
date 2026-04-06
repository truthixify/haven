import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IdentityService } from './identity.service';
import { TeeSessionGuard } from '../auth/guards/tee-session.guard';

interface VerifyWalletDto {
  ckbPubKey?: string;
  address?: string;
  signature: string;
  message: string;
  lockCodeHash?: string;
  lockHashType?: string;
  lockArgs?: string;
}

/**
 * Identity Controller
 *
 * Handles CKB wallet verification and identity registration.
 * The first step of the Haven Protocol user setup flow.
 */
@Controller('identity')
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);

  constructor(private readonly identityService: IdentityService) {}

  /**
   * Verify a CKB wallet and register the identity.
   *
   * This is the first call in the user setup flow:
   * 1. User signs identity message in dashboard via CCC
   * 2. Dashboard sends pubkey + signature + message to TEE
   * 3. TEE verifies and creates identity commitment
   * 4. Identity commitment returned to dashboard for subsequent calls
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyWallet(
    @Body() dto: VerifyWalletDto,
  ): Promise<{ identityCommitment: string }> {
    this.logger.log('Wallet verification request received');

    const identityKey = dto.ckbPubKey || dto.address;
    if (!identityKey || !dto.signature || !dto.message) {
      throw new BadRequestException(
        'Missing required fields: ckbPubKey (or address), signature, message',
      );
    }

    const result = await this.identityService.registerIdentity(
      identityKey,
      dto.signature,
      dto.message,
    );

    if (!result) {
      throw new BadRequestException(
        'Wallet verification failed. Invalid signature.',
      );
    }

    // Save lock script info if provided (used for on-chain activity scoring)
    if (dto.lockCodeHash && dto.lockArgs) {
      try {
        await this.identityService.updateLockScript(
          result.identityCommitment,
          dto.lockCodeHash,
          dto.lockHashType || 'type',
          dto.lockArgs,
        );
      } catch (err) {
        this.logger.warn(`Failed to save lock script: ${err}`);
      }
    }

    return result;
  }

  /**
   * Check if an identity commitment is registered.
   * Public endpoint - no auth required.
   */
  @Get('check')
  @HttpCode(HttpStatus.OK)
  async checkIdentity(
    @Req() req: Request,
  ): Promise<{ registered: boolean }> {
    const identityCommitment = req.query['commitment'] as string;

    if (!identityCommitment || !/^[0-9a-f]{64}$/i.test(identityCommitment)) {
      throw new BadRequestException('Invalid identity commitment format');
    }

    const registered =
      await this.identityService.isRegistered(identityCommitment);
    return { registered };
  }

  /**
   * Get the identity commitment for a public key.
   * Pure computation, no storage access needed.
   * Public endpoint.
   */
  @Post('commitment')
  @HttpCode(HttpStatus.OK)
  async getCommitment(
    @Body() body: { ckbPubKey: string },
  ): Promise<{ identityCommitment: string }> {
    if (!body.ckbPubKey) {
      throw new BadRequestException('Missing ckbPubKey');
    }

    const identityCommitment =
      this.identityService.getCommitmentForPubKey(body.ckbPubKey);
    return { identityCommitment };
  }
}
