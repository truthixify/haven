import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { ScoringScheduler } from './scoring.scheduler';
import { ScoreController } from './score.controller';
import { TwitterCollector } from './collectors/twitter.collector';
import { GitHubCollector } from './collectors/github.collector';
import { OnChainCollector } from './collectors/onchain.collector';
import { AttestationModule } from '../attestation/attestation.module';
import { ChainModule } from '../chain/chain.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [AttestationModule, ChainModule, NotificationModule],
  controllers: [ScoreController],
  providers: [
    ScoringService,
    ScoringScheduler,
    TwitterCollector,
    GitHubCollector,
    OnChainCollector,
  ],
  exports: [ScoringService, ScoringScheduler],
})
export class ScoringModule {}
