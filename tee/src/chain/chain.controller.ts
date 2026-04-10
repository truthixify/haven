import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ChainService } from './chain.service';

@ApiTags('Chain')
@Controller('chain')
export class ChainController {
  private readonly logger = new Logger(ChainController.name);

  constructor(private readonly chainService: ChainService) {}

  @Post('sign-topup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Co-sign a top-up transaction',
    description:
      'Signs the Haven lock witness (TEE path) for a user-initiated top-up. ' +
      'Validates that only deposit_balance increased before signing.',
  })
  async signTopUp(
    @Body()
    body: {
      scoreCellTxHash: string;
      scoreCellIndex: number;
      outputDataHex: string;
      txHash: string;
      witnesses: string[];
      inputCount: number;
    },
  ): Promise<{ witness: string }> {
    if (!body.scoreCellTxHash || !body.outputDataHex || !body.txHash) {
      throw new BadRequestException('Missing required fields');
    }

    const witness = await this.chainService.signTopUpWitness(body);
    if (!witness) {
      throw new BadRequestException(
        'Failed to sign top-up: transaction invalid or not a legitimate top-up',
      );
    }

    return { witness };
  }
}
