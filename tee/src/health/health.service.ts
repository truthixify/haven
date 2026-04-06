import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AttestationService } from '../attestation/attestation.service';

/**
 * Health Service
 *
 * Provides real runtime data about the TEE enclave:
 * - Enclave identity from dstack info()
 * - Last attestation timestamp (read from AttestationService)
 * - Process uptime
 * - Protocol version from package.json
 */
@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);

  /** Enclave identity from dstack info() */
  private enclaveId = 'unknown';

  /** Protocol version read from package.json */
  private protocolVersion = '0.0.0';

  constructor(private readonly attestationService: AttestationService) {}

  async onModuleInit(): Promise<void> {
    // Read protocol version from package.json
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require('../../../package.json');
      this.protocolVersion = pkg.version ?? '0.0.0';
    } catch {
      this.logger.warn('Could not read package.json version');
    }

    // Fetch enclave identity from dstack
    try {
      const info = await this.attestationService.getTeeInfo();
      this.enclaveId = info.instanceId || info.appId || 'unknown';
      this.logger.log(`Enclave ID resolved: ${this.enclaveId}`);
    } catch {
      this.logger.warn(
        'Could not fetch TEE info from dstack — running outside enclave?',
      );
    }
  }

  /**
   * Return the full health status payload.
   */
  getHealth(): {
    teeHealth: 'online' | 'degraded' | 'offline';
    enclaveId: string;
    lastAttestation: string | null;
    protocolVersion: string;
    uptime: number;
  } {
    // Determine health: if enclave ID is resolved we consider it online,
    // if enclave ID is unknown but the process is running, it's degraded.
    let teeHealth: 'online' | 'degraded' | 'offline' = 'online';
    if (this.enclaveId === 'unknown') {
      teeHealth = 'degraded';
    }

    return {
      teeHealth,
      enclaveId: this.enclaveId,
      lastAttestation: this.attestationService.getLastAttestationTimestamp(),
      protocolVersion: this.protocolVersion,
      uptime: Math.floor(process.uptime()),
    };
  }
}
