import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DstackClient } from '@phala/dstack-sdk';
import blake2b from 'blake2b';
import { DCAPAttestation, ScoreBreakdown } from '../common/types';

/**
 * Attestation Service - DCAP Attestation via Phala dstack SDK
 *
 * Uses @phala/dstack-sdk to generate real TDX remote attestation quotes
 * from within the Phala TEE environment. The DstackClient connects to the
 * dstack runtime socket (/var/run/dstack.sock) and requests hardware-backed
 * attestation quotes that prove the scoring computation ran inside a genuine
 * Intel TDX enclave.
 */
@Injectable()
export class AttestationService implements OnModuleInit {
  private readonly logger = new Logger(AttestationService.name);
  private dstack!: DstackClient;

  /** ISO timestamp of the last successful attestation quote */
  private lastAttestationTimestamp: string | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * Get the ISO timestamp of the most recent attestation, or null if
   * no attestation has been generated since the service started.
   */
  getLastAttestationTimestamp(): string | null {
    return this.lastAttestationTimestamp;
  }

  onModuleInit(): void {
    const endpoint = this.config.get<string>('dstack.endpoint');
    if (endpoint) {
      this.dstack = new DstackClient(endpoint);
      this.logger.log(`DstackClient initialized with endpoint: ${endpoint}`);
    } else {
      this.dstack = new DstackClient();
      this.logger.log('DstackClient initialized with default socket connection');
    }
  }

  /**
   * Generate a DCAP attestation over scoring output.
   *
   * Serializes the scoring result into a deterministic payload, then requests
   * a TDX quote from the dstack runtime. The quote cryptographically proves
   * that this exact payload was produced inside a genuine Intel TDX enclave.
   */
  async generateAttestation(
    programHash: string,
    identityCommitment: string,
    score: number,
    epoch: number,
    breakdown: ScoreBreakdown,
  ): Promise<DCAPAttestation> {
    this.logger.debug(
      `Generating DCAP attestation for epoch ${epoch}, score ${score}`,
    );

    const attestationPayload = this.buildAttestationPayload(
      programHash,
      identityCommitment,
      score,
      epoch,
      breakdown,
    );

    // Hash the payload to create the report data for the TDX quote.
    // The quote binds this hash to the TEE measurement, proving the
    // scoring program produced this exact output.
    const payloadHash = blake2b(32);
    payloadHash.update(attestationPayload);
    const reportData = payloadHash.digest('hex') as string;

    // Request a TDX attestation quote from the dstack runtime.
    // This calls into the Intel TDX hardware to produce a signed quote
    // containing the report data and TEE measurements (RTMRs).
    const tdxQuote = await this.dstack.getQuote(reportData);

    const now = Date.now();

    const attestation: DCAPAttestation = {
      report: tdxQuote.quote,
      eventLog: tdxQuote.event_log,
      rtmrs: tdxQuote.replayRtmrs(),
      timestamp: now,
      programHash,
      identityCommitment,
      score,
      epoch,
      breakdown,
    };

    // Track the timestamp of the most recent attestation
    this.lastAttestationTimestamp = new Date(now).toISOString();

    this.logger.debug('DCAP attestation generated successfully');
    return attestation;
  }

  /**
   * Get TEE instance information for verification/debugging.
   */
  async getTeeInfo(): Promise<{
    appId: string;
    instanceId: string;
    appName: string;
  }> {
    const info = await this.dstack.info();
    return {
      appId: info.app_id,
      instanceId: info.instance_id,
      appName: info.app_name,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Build the deterministic attestation payload.
   * This byte layout is what gets hashed and included in the TDX quote.
   * The SP1 proof worker verifies this same layout when generating proofs.
   */
  private buildAttestationPayload(
    programHash: string,
    identityCommitment: string,
    score: number,
    epoch: number,
    breakdown: ScoreBreakdown,
  ): Buffer {
    const payload = Buffer.alloc(
      32 + // program hash
        32 + // identity commitment
        2 + // score (u16)
        4 + // epoch (u32)
        8, // breakdown (4 x u16)
    );

    let offset = 0;

    // Program hash (32 bytes)
    Buffer.from(programHash.replace(/^0x/, ''), 'hex').copy(payload, offset);
    offset += 32;

    // Identity commitment (32 bytes)
    Buffer.from(identityCommitment.replace(/^0x/, ''), 'hex').copy(
      payload,
      offset,
    );
    offset += 32;

    // Score (2 bytes, big-endian)
    payload.writeUInt16BE(score, offset);
    offset += 2;

    // Epoch (4 bytes, big-endian)
    payload.writeUInt32BE(epoch, offset);
    offset += 4;

    // Breakdown (4 x 2 bytes, big-endian)
    payload.writeUInt16BE(breakdown.privacy, offset);
    offset += 2;
    payload.writeUInt16BE(breakdown.contribution, offset);
    offset += 2;
    payload.writeUInt16BE(breakdown.humanity, offset);
    offset += 2;
    payload.writeUInt16BE(breakdown.community, offset);

    return payload;
  }
}
