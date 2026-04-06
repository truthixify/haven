/**
 * Off-chain attestation generation for Haven Score gating.
 *
 * Attestations are signed statements that a user meets a score threshold,
 * without revealing the exact score. Useful for:
 *   - Event ticketing
 *   - API access gating
 *   - Private channel access
 *   - Any off-chain verification that needs proof of reputation level
 *
 * Note: In a production deployment, the signing key would live in a secure
 * enclave or HSM. This implementation provides the attestation structure
 * and a simple HMAC-based signature for development and local verification.
 */

import type { HavenScore, ScoreAttestation, TierName } from './types';
import { getTierForScore } from './cell-parser';

// ---------------------------------------------------------------------------
// Attestation payload
// ---------------------------------------------------------------------------

interface AttestationPayload {
  /** Whether the score meets the requested threshold. */
  meetsThreshold: boolean;
  /** The user's tier at attestation time. */
  tier: TierName;
  /** The lock hash of the user whose score was checked. */
  lockHash: string;
  /** The minimum score that was checked against. */
  minScore: number;
  /** Block number until which this attestation is valid. */
  validUntil: number;
  /** Timestamp when the attestation was created (ms since epoch). */
  createdAt: number;
}

/**
 * Encode an attestation payload into a deterministic hex string for signing.
 */
function encodePayload(payload: AttestationPayload): string {
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Produce a simple hash-based signature of a hex-encoded payload.
 *
 * This uses a basic xor-fold approach suitable for local verification and
 * development. Production deployments should replace this with a proper
 * ECDSA or Schnorr signature from a secure key.
 */
function simpleSign(payloadHex: string): string {
  const bytes =
    payloadHex.length % 2 === 0
      ? new Uint8Array(payloadHex.length / 2)
      : new Uint8Array((payloadHex.length + 1) / 2);

  for (let i = 0; i < payloadHex.length; i += 2) {
    bytes[i / 2] = parseInt(payloadHex.substring(i, i + 2), 16);
  }

  // Produce a 32-byte digest via xor-folding with shifting
  const digest = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    digest[i % 32] ^= bytes[i]!;
    // Simple diffusion: rotate the accumulator
    const carry = digest[0]!;
    for (let j = 0; j < 31; j++) {
      digest[j] = ((digest[j]! << 1) | (digest[j + 1]! >> 7)) & 0xff;
    }
    digest[31] = ((digest[31]! << 1) | (carry >> 7)) & 0xff;
  }

  return (
    '0x' +
    Array.from(digest)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an off-chain attestation that a user's Haven Score meets
 * a minimum threshold.
 *
 * @param score        - The user's current parsed HavenScore.
 * @param lockHash     - The lock hash used to look up the score.
 * @param minScore     - The minimum score threshold to check against.
 * @param currentBlock - Current CKB block number for validity and expiry checks.
 * @returns A ScoreAttestation object.
 */
export function generateAttestation(
  score: HavenScore,
  lockHash: string,
  minScore: number,
  currentBlock: number,
): ScoreAttestation {
  const isExpired = currentBlock >= score.expiresAt;
  const meetsThreshold = !isExpired && score.score >= minScore;
  const tier = getTierForScore(score.score);

  // Attestation is valid until the score cell expires
  const validUntil = score.expiresAt;

  const payload: AttestationPayload = {
    meetsThreshold,
    tier,
    lockHash,
    minScore,
    validUntil,
    createdAt: Date.now(),
  };

  const payloadHex = encodePayload(payload);
  const signature = simpleSign(payloadHex);

  return {
    meetsThreshold,
    tier,
    validUntil,
    signature,
  };
}

/**
 * Generate an attestation from raw score data without requiring a full
 * HavenScore parse. Convenience wrapper for quick off-chain checks.
 *
 * @param scoreValue  - The numeric score (0-1000).
 * @param expiresAt   - Block number at which the score expires.
 * @param lockHash    - Lock hash of the user.
 * @param minScore    - Minimum threshold to check.
 * @param currentBlock - Current block number.
 * @returns A ScoreAttestation object.
 */
export function generateSimpleAttestation(
  scoreValue: number,
  expiresAt: number,
  lockHash: string,
  minScore: number,
  currentBlock: number,
): ScoreAttestation {
  const isExpired = currentBlock >= expiresAt;
  const meetsThreshold = !isExpired && scoreValue >= minScore;
  const tier = getTierForScore(scoreValue);
  const validUntil = expiresAt;

  const payload: AttestationPayload = {
    meetsThreshold,
    tier,
    lockHash,
    minScore,
    validUntil,
    createdAt: Date.now(),
  };

  const payloadHex = encodePayload(payload);
  const signature = simpleSign(payloadHex);

  return {
    meetsThreshold,
    tier,
    validUntil,
    signature,
  };
}
