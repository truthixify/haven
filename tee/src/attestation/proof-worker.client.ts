import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import blake2b from 'blake2b';
import {
  DCAPAttestation,
  SP1ProofResult,
  SP1PublicInputs,
} from '../common/types';
import {
  PROOF_WORKER_PROVE_PATH,
  PROOF_WORKER_TIMEOUT_MS,
} from '../common/constants';

/**
 * Proof Worker Client
 *
 * HTTP client that sends TDX attestation quotes to the SP1 proof worker
 * service and receives DCAP proofs back. The proof worker uses Automata's
 * SP1 zkVM verifier to generate proofs of correct attestation verification.
 */
@Injectable()
export class ProofWorkerClient {
  private readonly logger = new Logger(ProofWorkerClient.name);
  private client!: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('proofWorker.url');
    this.client = axios.create({
      baseURL,
      timeout: PROOF_WORKER_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Request an SP1 DCAP proof from the proof worker.
   *
   * Sends the base64-encoded TDX attestation quote (from dstack getQuote)
   * along with Haven-specific public inputs. The proof worker generates
   * a real SP1 proof of DCAP attestation verification.
   */
  async requestProof(
    attestation: DCAPAttestation,
    publicInputs: SP1PublicInputs,
  ): Promise<SP1ProofResult> {
    this.logger.log(
      `Requesting SP1 DCAP proof for epoch ${publicInputs.epoch}, ` +
        `score ${publicInputs.previousScore} -> ${publicInputs.newScore}`,
    );

    const response = await this.client.post(PROOF_WORKER_PROVE_PATH, {
      attestation_quote: attestation.report,
      public_inputs: {
        program_hash: publicInputs.programHash,
        user_identity: publicInputs.identityCommitment,
        prev_score: publicInputs.previousScore,
        new_score: publicInputs.newScore,
        epoch: publicInputs.epoch,
        privacy_score: publicInputs.privacyScore,
        contribution_score: publicInputs.contributionScore,
        humanity_score: publicInputs.humanityScore,
        community_score: publicInputs.communityScore,
        prev_epoch: publicInputs.prevEpoch,
      },
    });

    const proofHex = response.data?.proof as string;
    const proofHash = response.data?.proof_hash as string;
    const vkHash = response.data?.vk_hash as string;

    if (!proofHex) {
      throw new Error('Proof worker returned empty proof');
    }

    if (!vkHash) {
      throw new Error('Proof worker returned empty vk_hash');
    }

    // Proof is already hex-encoded from the proof worker
    const proofBytes = proofHex;
    const publicValues = (response.data?.public_values as string) || '';

    const result: SP1ProofResult = {
      proofBytes,
      proofHash: proofHash || this.hashProof(proofBytes),
      publicInputs,
      vkHash,
      publicValues,
    };

    this.logger.log(
      `SP1 DCAP proof received: ${proofBytes.length / 2} bytes, ` +
        `hash=${result.proofHash.substring(0, 16)}..., ` +
        `vk_hash=${vkHash.substring(0, 16)}..., ` +
        `journal=${publicValues.length / 2} bytes, ` +
        `program_id=${response.data?.program_id || 'unknown'}`,
    );

    return result;
  }

  /**
   * Health check for the proof worker service.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5_000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Compute Blake2b-256 hash of proof bytes (fallback if worker doesn't return hash).
   */
  private hashProof(proofBytesHex: string): string {
    const proofBuffer = Buffer.from(proofBytesHex, 'hex');
    const hash = blake2b(32);
    hash.update(proofBuffer);
    return hash.digest('hex') as string;
  }
}
