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
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiQuery } from '@nestjs/swagger';
import { ScoringScheduler } from './scoring.scheduler';
import { DatabaseService } from '../storage/database.service';
import { ScoreHistoryService } from '../storage/score-history.service';

@ApiTags('Score')
@Controller('score')
export class ScoreController {
  private readonly logger = new Logger(ScoreController.name);

  constructor(
    private readonly scoringScheduler: ScoringScheduler,
    private readonly databaseService: DatabaseService,
    private readonly scoreHistoryService: ScoreHistoryService,
  ) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request score refresh',
    description:
      'Triggers the TEE to re-collect activity data and re-compute the score for the given identity. ' +
      'The full pipeline (attestation, proof, chain submission) runs if the proof worker is available.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        score: { type: 'number', nullable: true },
        message: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing or unregistered identity commitment' })
  async refreshScore(
    @Body() body: { identityCommitment: string },
  ): Promise<{ success: boolean; score: number | null; message: string }> {
    if (!body.identityCommitment) {
      throw new BadRequestException('Missing identityCommitment');
    }

    const user = await this.databaseService.getUserRecord(body.identityCommitment);
    if (!user) {
      throw new BadRequestException('Identity not registered');
    }

    if (this.scoringScheduler.getIsRunning()) {
      throw new ServiceUnavailableException(
        'A scoring cycle is already running. Try again shortly.',
      );
    }

    this.logger.log(
      `Manual score refresh requested for ${body.identityCommitment.substring(0, 16)}...`,
    );

    const result = await this.scoringScheduler.scoreSingleUser(
      body.identityCommitment,
    );

    if (!result) {
      return {
        success: false,
        score: null,
        message: 'Scoring returned no result',
      };
    }

    return {
      success: true,
      score: result.score,
      message: `Score refreshed: ${result.score}/1000`,
    };
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get score history',
    description: 'Returns the score history for a given identity commitment, ordered by epoch.',
  })
  @ApiQuery({ name: 'commitment', description: 'Identity commitment (64-char hex)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max entries to return', example: '50' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              epoch: { type: 'number' },
              score: { type: 'number' },
              privacy: { type: 'number' },
              contribution: { type: 'number' },
              humanity: { type: 'number' },
              community: { type: 'number' },
              txHash: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getHistory(
    @Query('commitment') commitment: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!commitment) {
      throw new BadRequestException('Missing commitment query parameter');
    }

    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const history = await this.scoreHistoryService.getHistory(commitment, limit);

    return { history };
  }
}
