import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiQuery, ApiProperty } from '@nestjs/swagger';
import { IdentityService } from './identity.service';

class VerifyWalletDto {
  @ApiProperty({ description: 'CKB public key (hex)', required: false })
  ckbPubKey?: string;

  @ApiProperty({ description: 'CKB address (alternative to ckbPubKey)', required: false })
  address?: string;

  @ApiProperty({ description: 'Wallet signature over the message' })
  signature: string;

  @ApiProperty({ description: 'Message that was signed' })
  message: string;

  @ApiProperty({ description: 'Lock script code hash', required: false })
  lockCodeHash?: string;

  @ApiProperty({ description: 'Lock script hash type', required: false, default: 'type' })
  lockHashType?: string;

  @ApiProperty({ description: 'Lock script args', required: false })
  lockArgs?: string;
}

class CommitmentDto {
  @ApiProperty({ description: 'CKB public key (hex)' })
  ckbPubKey: string;
}

class ScoreCellDto {
  @ApiProperty({ description: 'Identity commitment (64-char hex)' })
  identityCommitment: string;

  @ApiProperty({ description: 'Transaction hash of the score cell creation tx' })
  txHash: string;

  @ApiProperty({ description: 'Output index of the score cell', default: 0 })
  index: number;
}

@ApiTags('Identity')
@Controller('identity')
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);

  constructor(private readonly identityService: IdentityService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register identity', description: 'Verify a CKB wallet signature and register the identity commitment in the TEE.' })
  @ApiOkResponse({ schema: { type: 'object', properties: { identityCommitment: { type: 'string' } } } })
  @ApiBadRequestResponse({ description: 'Missing fields or invalid signature' })
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

  @Get('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check identity', description: 'Check if an identity commitment is registered in the TEE.' })
  @ApiQuery({ name: 'commitment', description: '64-char hex identity commitment' })
  @ApiOkResponse({ schema: { type: 'object', properties: { registered: { type: 'boolean' } } } })
  async checkIdentity(
    @Query('commitment') commitment: string,
  ): Promise<{ registered: boolean }> {
    if (!commitment || !/^[0-9a-f]{64}$/i.test(commitment)) {
      throw new BadRequestException('Invalid identity commitment format');
    }

    const registered =
      await this.identityService.isRegistered(commitment);
    return { registered };
  }

  @Post('commitment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get commitment', description: 'Compute the identity commitment for a given CKB public key. Pure computation, no storage access.' })
  @ApiOkResponse({ schema: { type: 'object', properties: { identityCommitment: { type: 'string' } } } })
  async getCommitment(
    @Body() body: CommitmentDto,
  ): Promise<{ identityCommitment: string }> {
    if (!body.ckbPubKey) {
      throw new BadRequestException('Missing ckbPubKey');
    }

    const identityCommitment =
      this.identityService.getCommitmentForPubKey(body.ckbPubKey);
    return { identityCommitment };
  }

  @Post('score-cell')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save score cell outpoint', description: 'Save the on-chain score cell outpoint so the TEE knows where to send updates.' })
  @ApiOkResponse({ schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async saveScoreCellOutpoint(
    @Body() body: ScoreCellDto,
  ): Promise<{ success: boolean }> {
    if (!body.identityCommitment || !body.txHash) {
      throw new BadRequestException('Missing identityCommitment or txHash');
    }

    const exists = await this.identityService.isRegistered(body.identityCommitment);
    if (!exists) {
      throw new BadRequestException('Identity not registered');
    }

    await this.identityService.saveScoreCellOutpoint(
      body.identityCommitment,
      body.txHash,
      body.index ?? 0,
    );

    return { success: true };
  }
}
