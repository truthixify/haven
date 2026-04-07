import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ccc } from '@ckb-ccc/core';
import blake2b from 'blake2b';
import {
  CellOutpoint,
  ScoreCellData,
  ScoringResult,
  SP1ProofResult,
  SP1PublicInputs,
} from '../common/types';
import {
  serializeScoreCellData,
  deserializeScoreCellData,
  buildUpdatedScoreCellData,
  cellDataToHex,
  hexToCellData,
} from './cell-builder';
import { RegistryService } from './registry.service';
import {
  DEFAULT_UPDATE_FEE,
  SCORE_EXPIRY_BLOCKS,
} from '../common/constants';

/**
 * Chain Service
 *
 * Handles all CKB transaction building and submission using @ckb-ccc/core.
 *
 * Responsibilities:
 * - Build score update transactions (input old cell, output new cell)
 * - Include SP1 proof in transaction witness
 * - Sign and submit transactions to CKB
 * - Read existing score cells from CKB
 *
 * Uses CCC (Common Chain Connector) exclusively for all CKB interactions.
 * Lumos SDK is deprecated and not used.
 */
@Injectable()
export class ChainService implements OnModuleInit {
  private readonly logger = new Logger(ChainService.name);

  /**
   * CCC client and signer.
   *
   * In production these are initialized from @ckb-ccc/core:
   *   const client = new ccc.ClientPublicTestnet();
   *   const signer = new ccc.SignerCkbPrivateKey(client, TEE_SIGNING_KEY);
   *
   * For now, we store the configuration and make RPC calls directly
   * until the full CCC dependency is wired up.
   */
  private teeSigningKey!: string;
  private rpcUrl!: string;
  private network!: string;
  private cccClient!: ccc.Client;
  private cccSigner!: ccc.SignerCkbPrivateKey;

  constructor(
    private readonly config: ConfigService,
    private readonly registryService: RegistryService,
  ) {}

  onModuleInit(): void {
    this.teeSigningKey = this.config.get<string>('ckb.teeSigningKey') || '';
    this.rpcUrl = this.config.get<string>('ckb.rpcUrl') || '';
    this.network = this.config.get<string>('ckb.network') || 'testnet';

    if (!this.teeSigningKey || this.teeSigningKey === '0'.repeat(66)) {
      this.logger.warn(
        'TEE_SIGNING_KEY not configured - transaction submission will fail',
      );
    }

    // Initialize CCC client and signer
    this.cccClient = this.network === 'mainnet'
      ? new ccc.ClientPublicMainnet()
      : new ccc.ClientPublicTestnet();
    this.cccSigner = new ccc.SignerCkbPrivateKey(this.cccClient, this.teeSigningKey);

    this.logger.log(`Chain service initialized for ${this.network}`);
  }

  /**
   * Submit a score update transaction to CKB.
   *
   * This is the core transaction builder that:
   * 1. Reads the current score cell
   * 2. Builds the updated score cell data
   * 3. Includes the SP1 proof in the witness
   * 4. Signs and submits via CCC
   *
   * @param outpoint - Current score cell outpoint
   * @param scoringResult - New scoring result
   * @param proof - SP1 proof result
   * @param programHash - Current program hash from registry
   * @returns Transaction hash, or null if submission fails
   */
  async submitScoreUpdate(
    outpoint: CellOutpoint,
    scoringResult: ScoringResult,
    proof: SP1ProofResult,
    programHash: Buffer,
  ): Promise<string | null> {
    this.logger.log(
      `Building score update tx for ${scoringResult.identityCommitment.substring(0, 16)}...`,
    );

    try {
      // 1. Read the current score cell
      const currentCellData = await this.readScoreCell(outpoint);
      if (!currentCellData) {
        throw new Error(`Score cell not found at ${outpoint.txHash}:${outpoint.index}`);
      }

      // 2. Get current block number for timestamps
      const tipBlockNumber = await this.registryService.getTipBlockNumber();

      // 3. Get update fee from registry
      const updateFee = await this.registryService.getUpdateFee();

      // 4. Compute proof hash
      const proofHashBuf = Buffer.from(proof.proofHash, 'hex');

      // 5. Build updated score cell data
      const updatedData = buildUpdatedScoreCellData(
        currentCellData,
        scoringResult.score,
        scoringResult.breakdown,
        scoringResult.epoch,
        programHash,
        proofHashBuf,
        tipBlockNumber,
        SCORE_EXPIRY_BLOCKS,
        updateFee,
      );

      // 6. Serialize the new cell data
      const newCellDataBytes = serializeScoreCellData(updatedData);
      const newCellDataHex = cellDataToHex(newCellDataBytes);

      // Build and submit transaction using CCC
      const txHash = await this.buildAndSubmitTransaction(
        outpoint,
        newCellDataHex,
        proof.proofBytes,
        updateFee,
        proof.publicInputs,
        proof.vkHash,
      );

      if (txHash) {
        this.logger.log(`Score update tx submitted: ${txHash}`);
      }

      return txHash;
    } catch (error) {
      this.logger.error('Failed to submit score update transaction', error);
      return null;
    }
  }

  /**
   * Read a score cell from CKB by its outpoint.
   *
   * @param outpoint - The cell outpoint (txHash + index)
   * @returns Deserialized score cell data, or null if not found
   */
  async readScoreCell(
    outpoint: CellOutpoint,
  ): Promise<ScoreCellData | null> {
    try {
      const { default: axios } = await import('axios');

      const response = await axios.post(
        this.rpcUrl,
        {
          id: 1,
          jsonrpc: '2.0',
          method: 'get_transaction',
          params: [outpoint.txHash],
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15_000,
        },
      );

      const tx = response.data?.result?.transaction;
      if (
        !tx ||
        !tx.outputs_data ||
        outpoint.index >= tx.outputs_data.length
      ) {
        this.logger.warn(
          `Score cell not found: ${outpoint.txHash}:${outpoint.index}`,
        );
        return null;
      }

      const cellDataHex = tx.outputs_data[outpoint.index];
      const cellDataBuf = hexToCellData(cellDataHex);

      return deserializeScoreCellData(cellDataBuf);
    } catch (error) {
      this.logger.error('Failed to read score cell', error);
      return null;
    }
  }

  /**
   * Get the Haven type script configuration.
   */
  getTypeScript(): { codeHash: string; hashType: string } {
    return {
      codeHash:
        this.config.get<string>('haven.typeScriptCodeHash') || '',
      hashType:
        this.config.get<string>('haven.typeScriptHashType') || 'type',
    };
  }

  // -----------------------------------------------------------------------
  // Private transaction building
  // -----------------------------------------------------------------------

  /**
   * Build and submit a raw transaction to CKB.
   *
   * This is a low-level implementation used before the full CCC
   * integration. In production, the CCC transaction builder (shown
   * in the submitScoreUpdate comments) handles all of this automatically.
   */
  private async buildAndSubmitTransaction(
    inputOutpoint: CellOutpoint,
    outputDataHex: string,
    proofBytesHex: string,
    _updateFee: bigint,
    publicInputs: SP1PublicInputs,
    vkHash: string,
  ): Promise<string | null> {
    try {
      // Build the TEE witness
      const witnessHex = buildTeeWitness(publicInputs, vkHash, proofBytesHex);

      // Fetch the input cell to copy its output
      const inputCells = await this.cccClient.getTransaction(inputOutpoint.txHash);
      if (!inputCells) throw new Error('Could not fetch input transaction');

      const inputCellOutput = inputCells.transaction.outputs[inputOutpoint.index];
      if (!inputCellOutput) throw new Error('Input cell not found');

      // Get the signer's address for the change cell
      const signerAddress = await this.cccSigner.getRecommendedAddressObj();

      // Build all required cell deps
      const allCellDeps: ccc.CellDepLike[] = [];

      // 1. Haven lock script cell dep (for the score cell's lock)
      const lockScriptCellDepTx = this.config.get<string>('haven.lockScriptCellDepTxHash') || '';
      if (lockScriptCellDepTx) {
        allCellDeps.push({
          outPoint: { txHash: lockScriptCellDepTx, index: 0 },
          depType: 'code',
        });
      }

      // 2. Haven type script cell dep
      const typeScriptCellDepTx = this.config.get<string>('haven.typeScriptCellDepTxHash') || '';
      if (typeScriptCellDepTx) {
        allCellDeps.push({
          outPoint: { txHash: typeScriptCellDepTx, index: 0 },
          depType: 'code',
        });
      }

      // 3. Registry cell dep
      const registryTxHash = this.config.get<string>('haven.registryTxHash') || '';
      if (registryTxHash) {
        allCellDeps.push({
          outPoint: { txHash: registryTxHash, index: 0 },
          depType: 'code',
        });
      }

      // 4. secp256k1 cell dep (for the TEE signer's fee cell)
      try {
        const secp = await this.cccClient.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
        for (const dep of secp.cellDeps) {
          allCellDeps.push(dep.cellDep);
        }
      } catch {}

      this.logger.debug(`Cell deps: ${allCellDeps.length} total`);

      // Build the transaction
      const tx = ccc.Transaction.from({
        cellDeps: allCellDeps,
        inputs: [
          {
            previousOutput: {
              txHash: inputOutpoint.txHash,
              index: inputOutpoint.index,
            },
          },
        ],
        outputs: [inputCellOutput],
        outputsData: [outputDataHex as `0x${string}`],
        witnesses: [witnessHex],
      });

      // Let CCC add fee-paying inputs and calculate fees
      await tx.completeInputsByCapacity(this.cccSigner);
      await tx.completeFeeBy(this.cccSigner, 1000);

      // Ensure our witness for input 0 wasn't overwritten by CCC
      if (tx.witnesses.length > 0) {
        tx.witnesses[0] = witnessHex as `0x${string}`;
      }

      const txHash = await this.cccSigner.sendTransaction(tx);

      this.logger.log(`Transaction submitted: ${txHash}`);
      return txHash;
    } catch (error) {
      this.logger.error('Transaction build/submit failed:', error);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Witness builder
// ---------------------------------------------------------------------------

/**
 * Build the TEE update witness with the layout expected by the Haven type script:
 *
 *   [0]         = path_flag (0x00 for TEE update)
 *   [1..85]     = public_inputs (84 bytes, little-endian)
 *   [85..117]   = vk_hash (32 bytes)
 *   [117..121]  = proof_len (u32 LE)
 *   [121..]     = proof bytes
 */
function buildTeeWitness(
  publicInputs: SP1PublicInputs,
  vkHash: string,
  proofBytesHex: string,
): string {
  const proofBuf = Buffer.from(proofBytesHex, 'hex');
  const totalLen = 1 + 84 + 32 + 4 + proofBuf.length;
  const witness = Buffer.alloc(totalLen);
  let offset = 0;

  // path flag
  witness.writeUInt8(0x00, offset);
  offset += 1;

  // public inputs (84 bytes, little-endian)
  Buffer.from(publicInputs.programHash, 'hex').copy(witness, offset);
  offset += 32;
  Buffer.from(publicInputs.identityCommitment, 'hex').copy(witness, offset);
  offset += 32;
  witness.writeUInt16LE(publicInputs.previousScore, offset);
  offset += 2;
  witness.writeUInt16LE(publicInputs.newScore, offset);
  offset += 2;
  witness.writeUInt32LE(publicInputs.epoch, offset);
  offset += 4;
  witness.writeUInt16LE(publicInputs.privacyScore, offset);
  offset += 2;
  witness.writeUInt16LE(publicInputs.contributionScore, offset);
  offset += 2;
  witness.writeUInt16LE(publicInputs.humanityScore, offset);
  offset += 2;
  witness.writeUInt16LE(publicInputs.communityScore, offset);
  offset += 2;
  witness.writeUInt32LE(publicInputs.prevEpoch, offset);
  offset += 4;

  // vk_hash (32 bytes)
  Buffer.from(vkHash, 'hex').copy(witness, offset);
  offset += 32;

  // proof_len (u32 LE)
  witness.writeUInt32LE(proofBuf.length, offset);
  offset += 4;

  // proof bytes
  proofBuf.copy(witness, offset);

  return '0x' + witness.toString('hex');
}
