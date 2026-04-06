import { Module } from '@nestjs/common';
import { AttestationService } from './attestation.service';
import { ProofWorkerClient } from './proof-worker.client';

@Module({
  providers: [AttestationService, ProofWorkerClient],
  exports: [AttestationService, ProofWorkerClient],
})
export class AttestationModule {}
