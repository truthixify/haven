import { Injectable, Logger } from '@nestjs/common';
import blake2b from 'blake2b';
import { DatabaseService } from '../storage/database.service';
import { SealedUserRecord, UserIdentity } from '../common/types';

/**
 * Identity Service
 *
 * Handles CKB wallet verification and identity commitment generation.
 *
 * The identity commitment is a Blake2b hash of the CKB public key.
 * This is the primary identifier used throughout Haven Protocol -
 * it appears on-chain in score cells but cannot be reversed to
 * reveal the actual public key or wallet address.
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Generate an identity commitment from a CKB public key.
   * Uses Blake2b-256 (CKB's native hash function).
   *
   * @param ckbPubKey - The CKB public key (hex string with 0x prefix)
   * @returns 32-byte Blake2b hash as hex string
   */
  generateIdentityCommitment(ckbPubKey: string): string {
    const pubKeyBytes = Buffer.from(
      ckbPubKey.startsWith('0x') ? ckbPubKey.slice(2) : ckbPubKey,
      'hex',
    );

    const hash = blake2b(32);
    hash.update(pubKeyBytes);
    const digest = hash.digest('hex') as string;

    return digest;
  }

  /**
   * Verify a CKB wallet signature and create the user identity.
   *
   * The user signs an identity message in the dashboard using CCC.
   * The TEE verifies the signature to confirm the user controls
   * the private key corresponding to the public key.
   *
   * @param ckbPubKey - CKB public key (hex)
   * @param signature - Signature of the identity message (hex)
   * @param message - The identity message that was signed
   * @returns The user identity with commitment, or null if verification fails
   */
  async verifyAndCreateIdentity(
    ckbPubKey: string,
    signature: string,
    message: string,
  ): Promise<UserIdentity | null> {
    this.logger.log('Verifying CKB wallet signature...');

    // Verify the signature using CCC's verification.
    // In a full implementation, this uses @ckb-ccc/core's signature
    // verification. For now we perform basic validation and
    // will integrate full CCC verification when the TEE has
    // access to the CCC client.
    const isValid = this.verifyCkbSignature(ckbPubKey, signature, message);

    if (!isValid) {
      this.logger.warn('CKB signature verification failed');
      return null;
    }

    const identityCommitment = this.generateIdentityCommitment(ckbPubKey);
    const commitmentBuffer = Buffer.from(identityCommitment, 'hex');

    this.logger.log(
      `Identity created: ${identityCommitment.substring(0, 16)}...`,
    );

    return {
      identityCommitment: commitmentBuffer,
      ckbPubKey,
    };
  }

  /**
   * Register a new user identity in sealed storage.
   * Called after successful wallet verification.
   */
  async registerIdentity(
    ckbPubKey: string,
    signature: string,
    message: string,
  ): Promise<{ identityCommitment: string } | null> {
    const identity = await this.verifyAndCreateIdentity(
      ckbPubKey,
      signature,
      message,
    );

    if (!identity) {
      return null;
    }

    const identityCommitment = identity.identityCommitment.toString('hex');

    // Check if this identity already exists
    const existing =
      await this.databaseService.hasUserRecord(identityCommitment);
    if (existing) {
      this.logger.log(
        `Identity ${identityCommitment.substring(0, 16)}... already registered`,
      );
      return { identityCommitment };
    }

    // Create a new sealed user record with only the wallet identity.
    // Twitter and GitHub will be linked separately via OAuth flows.
    const record: SealedUserRecord = {
      identityCommitment,
      ckbPubKey,
    };

    await this.databaseService.storeUserRecord(record);
    this.logger.log(
      `New identity registered: ${identityCommitment.substring(0, 16)}...`,
    );

    return { identityCommitment };
  }

  /**
   * Get the identity commitment for a known public key.
   * Does not require sealed storage access - pure computation.
   */
  getCommitmentForPubKey(ckbPubKey: string): string {
    return this.generateIdentityCommitment(ckbPubKey);
  }

  /**
   * Check if an identity commitment is registered.
   */
  async isRegistered(identityCommitment: string): Promise<boolean> {
    return this.databaseService.hasUserRecord(identityCommitment);
  }

  /**
   * Save the score cell outpoint for a user.
   * Called after the dashboard creates a score cell on-chain.
   */
  async saveScoreCellOutpoint(
    identityCommitment: string,
    txHash: string,
    index: number,
  ): Promise<void> {
    await this.databaseService.updateUserRecord(identityCommitment, {
      scoreCellOutpoint: { txHash, index },
    });
    this.logger.log(
      `Score cell outpoint saved for ${identityCommitment.substring(0, 16)}...: ${txHash}:${index}`,
    );
  }

  /**
   * Update the lock script info for a user — used for on-chain activity scoring.
   * Different wallet types (secp256k1, omnilock, JoyID) have different lock scripts.
   */
  async updateLockScript(
    identityCommitment: string,
    lockCodeHash: string,
    lockHashType: string,
    lockArgs: string,
  ): Promise<void> {
    await this.databaseService.updateUserRecord(identityCommitment, {
      lockCodeHash,
      lockHashType,
      lockArgs,
    });
    this.logger.log(
      `Lock script updated for ${identityCommitment.substring(0, 16)}...`,
    );
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Verify a CKB signature.
   *
   * In a full implementation, this uses @ckb-ccc/core's secp256k1
   * signature verification to confirm that the signature over the
   * message was produced by the private key corresponding to ckbPubKey.
   *
   * The verification logic:
   * 1. Hash the message with the CKB signing prefix
   * 2. Recover the public key from the signature
   * 3. Compare the recovered key with the provided ckbPubKey
   */
  private verifyCkbSignature(
    ckbPubKey: string,
    signature: string,
    _message: string,
  ): boolean {
    // Basic format validation
    if (!ckbPubKey || !signature) {
      return false;
    }

    const pubKeyStr = String(ckbPubKey || '');
    const sigStr = String(signature || '');
    const pubKeyHex = pubKeyStr.startsWith('0x')
      ? pubKeyStr.slice(2)
      : pubKeyStr;
    const sigHex = sigStr.startsWith('0x')
      ? sigStr.slice(2)
      : sigStr;

    if (pubKeyHex.length < 2) {
      this.logger.warn(`Invalid public key: empty or too short (${pubKeyHex.length} chars)`);
      return false;
    }

    if (sigHex.length < 2) {
      this.logger.warn(`Invalid signature: empty or too short (${sigHex.length} chars)`);
      return false;
    }

    // TODO: Integrate full CCC signature verification:
    //
    // import { ccc } from '@ckb-ccc/core';
    //
    // const messageHash = blake2b(32);
    // messageHash.update(Buffer.from(message));
    // const digest = messageHash.digest();
    //
    // const recoveredPubKey = ccc.secp256k1.recoverPublicKey(
    //   digest,
    //   Buffer.from(sigHex, 'hex'),
    // );
    //
    // return recoveredPubKey === ckbPubKey;

    // For development, accept well-formed inputs
    return true;
  }
}
