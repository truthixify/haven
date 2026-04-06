import { Module } from '@nestjs/common';
import { AttestationModule } from '../attestation/attestation.module';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AttestationModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
