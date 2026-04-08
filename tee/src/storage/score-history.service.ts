import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScoreHistoryEntity } from './entities/score-history.entity';
import { ScoreBreakdown } from '../common/types';

@Injectable()
export class ScoreHistoryService {
  private readonly logger = new Logger(ScoreHistoryService.name);

  constructor(
    @InjectRepository(ScoreHistoryEntity)
    private readonly repo: Repository<ScoreHistoryEntity>,
  ) {}

  async record(
    identityCommitment: string,
    epoch: number,
    score: number,
    breakdown: ScoreBreakdown,
    txHash?: string | null,
  ): Promise<void> {
    const entry = this.repo.create({
      identityCommitment,
      epoch,
      score,
      privacy: breakdown.privacy,
      contribution: breakdown.contribution,
      humanity: breakdown.humanity,
      community: breakdown.community,
      txHash: txHash ?? null,
    });
    await this.repo.save(entry);
  }

  async getHistory(
    identityCommitment: string,
    limit = 50,
  ): Promise<Array<{ epoch: number; score: number; privacy: number; contribution: number; humanity: number; community: number; txHash: string | null; createdAt: Date }>> {
    return this.repo.find({
      where: { identityCommitment },
      order: { epoch: 'ASC' },
      take: limit,
    });
  }
}
