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
import { DEFAULT_UPDATE_FEE } from '../common/constants';

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

    // Log TEE signer identity for verification against lock args
    this.cccSigner.getRecommendedAddressObj().then((addr) => {
      const lockArgs = addr.script.args;
      this.logger.log(`TEE signer blake160: ${lockArgs}`);
      this.logger.log(`TEE signer address: ${addr.toString()}`);
    }).catch(() => {});

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

      // 3. Get update fee and epoch duration from on-chain registry
      const updateFee = await this.registryService.getUpdateFee();
      const epochDuration = await this.registryService.getEpochDurationBlocks();

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
        epochDuration,
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
        proof.publicValues,
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
   * Build and submit a score update transaction to CKB.
   *
   * Transaction layout:
   *   Input  0: Score cell (Haven lock)
   *   Input  1+: Fee cells (secp256k1_blake160, owned by TEE signer)
   *   Output 0: Updated score cell (same lock + type as input)
   *   Output 1+: Change cell(s)
   *
   * Witness layout (molecule WitnessArgs):
   *   witness[0].lock      = [0x00 (TEE path) | tee_signature(65)]
   *   witness[0].inputType = [path_flag | public_inputs | vk_hash | proof_len | proof]
   *   witness[1].lock      = secp256k1 signature for fee cell
   *
   * Cell deps: Haven lock, Haven type, Registry, secp256k1 system scripts
   */
  private async buildAndSubmitTransaction(
    inputOutpoint: CellOutpoint,
    outputDataHex: string,
    proofBytesHex: string,
    _updateFee: bigint,
    publicInputs: SP1PublicInputs,
    vkHash: string,
    publicValues: string,
  ): Promise<string | null> {
    try {
      // === 1. Build TEE proof data (for WitnessArgs.inputType) ===
      const teeProofHex = buildTeeProofData(publicInputs, vkHash, proofBytesHex, publicValues);

      // === 2. Build WitnessArgs for witness[0] with signature placeholder ===
      // Lock: [path_flag(1) | zeros(65)] = 66 bytes (signature filled later)
      // inputType: TEE proof data (read by the Haven type script)
      const lockPlaceholder = Buffer.alloc(66);
      lockPlaceholder[0] = 0x00; // TEE update path flag
      const witness0 = ccc.WitnessArgs.from({
        lock: ('0x' + lockPlaceholder.toString('hex')) as `0x${string}`,
        inputType: teeProofHex as `0x${string}`,
      });
      const witness0Hex = ('0x' + Buffer.from(witness0.toBytes()).toString('hex')) as `0x${string}`;

      // === 3. Fetch the input cell ===
      const inputTx = await this.cccClient.getTransaction(inputOutpoint.txHash);
      if (!inputTx) throw new Error('Could not fetch input transaction');
      const inputCellOutput = inputTx.transaction.outputs[inputOutpoint.index];
      if (!inputCellOutput) throw new Error('Input cell not found at specified index');

      // Verify TEE key matches the lock args
      const lockArgs = inputCellOutput.lock.args.replace(/^0x/, '');
      const teePubkeyHashInLock = lockArgs.substring(40, 80); // bytes 20-39
      const signerAddr = await this.cccSigner.getRecommendedAddressObj();
      const signerBlake160 = signerAddr.script.args.replace(/^0x/, '');
      if (teePubkeyHashInLock !== signerBlake160) {
        throw new Error(
          `TEE key mismatch: lock args tee_hash=${teePubkeyHashInLock}, signer blake160=${signerBlake160}`,
        );
      }

      // Ensure the output cell has a type script (Haven lock verifies this)
      if (!inputCellOutput.type) {
        const typeCodeHash = this.config.get<string>('haven.typeScriptCodeHash') || '';
        const typeHashType = this.config.get<string>('haven.typeScriptHashType') || 'type';
        if (!typeCodeHash) throw new Error('Score cell has no type script and HAVEN_TYPE_SCRIPT_CODE_HASH is not configured');
        inputCellOutput.type = ccc.Script.from({
          codeHash: typeCodeHash,
          hashType: typeHashType,
          args: inputCellOutput.lock.args,
        });
      }

      // === 4. Build cell deps (fail-fast if any is missing) ===
      const allCellDeps: ccc.CellDepLike[] = [];

      const lockCellDepTx = this.config.get<string>('haven.lockScriptCellDepTxHash') || '';
      if (!lockCellDepTx) throw new Error('HAVEN_LOCK_SCRIPT_CELLDEP_TX_HASH is not configured');
      allCellDeps.push({ outPoint: { txHash: lockCellDepTx, index: 0 }, depType: 'code' });

      const typeCellDepTx = this.config.get<string>('haven.typeScriptCellDepTxHash') || '';
      if (!typeCellDepTx) throw new Error('HAVEN_TYPE_SCRIPT_CELLDEP_TX_HASH is not configured');
      allCellDeps.push({ outPoint: { txHash: typeCellDepTx, index: 0 }, depType: 'code' });

      const registryTxHash = this.config.get<string>('haven.registryTxHash') || '';
      if (!registryTxHash) throw new Error('HAVEN_REGISTRY_TX_HASH is not configured');
      allCellDeps.push({ outPoint: { txHash: registryTxHash, index: 0 }, depType: 'code' });

      // secp256k1 cell deps added by prepareTransaction below

      // === 5. Build the transaction ===
      const tx = ccc.Transaction.from({
        cellDeps: allCellDeps,
        inputs: [{
          previousOutput: {
            txHash: inputOutpoint.txHash,
            index: inputOutpoint.index,
          },
        }],
        outputs: [inputCellOutput],
        outputsData: [outputDataHex as `0x${string}`],
        witnesses: [witness0Hex],
      });

      // === 6. Let CCC add fee-paying inputs and calculate fees ===
      await tx.completeInputsByCapacity(this.cccSigner);
      await tx.completeFeeBy(this.cccSigner, 1000);

      // === 7. Let CCC add secp256k1 cell deps and prepare fee cell witness ===
      // prepareTransaction adds the secp256k1 dep group (code + data cells)
      // and sets up the fee cell witness placeholder. It does NOT touch
      // witness[0] because the Haven lock doesn't match the signer's script.
      const preparedTx = await this.cccSigner.prepareTransaction(tx);

      // Restore witness[0] on the prepared copy
      preparedTx.witnesses[0] = witness0Hex;

      // === 8. Compute Haven lock sighash manually ===
      // Replicate the exact on-chain algorithm from build_sighash_all_message()
      // Use preparedTx from here (has secp256k1 cell deps added by CCC)
      const txRawHash = preparedTx.hash();
      const txHashBytes = Buffer.from(txRawHash.replace(/^0x/, ''), 'hex');

      // Build zeroed WitnessArgs: lock = 66 zero bytes, inputType = teeProof
      const zeroedWa = ccc.WitnessArgs.from({
        lock: ('0x' + Buffer.alloc(66).toString('hex')) as `0x${string}`,
        inputType: teeProofHex as `0x${string}`,
      });
      const zeroedWaBytes = Buffer.from(zeroedWa.toBytes());

      const hasher = blake2b(32, null, null, Buffer.from('ckb-default-hash'));
      hasher.update(txHashBytes);
      const lenBuf = Buffer.alloc(8);
      lenBuf.writeBigUInt64LE(BigInt(zeroedWaBytes.length));
      hasher.update(lenBuf);
      hasher.update(zeroedWaBytes);

      // Extra witnesses beyond input count
      for (let i = preparedTx.inputs.length; i < preparedTx.witnesses.length; i++) {
        const wb = Buffer.from(preparedTx.witnesses[i].replace(/^0x/, ''), 'hex');
        const wl = Buffer.alloc(8);
        wl.writeBigUInt64LE(BigInt(wb.length));
        hasher.update(wl);
        hasher.update(wb);
      }

      const sighash = Buffer.from(hasher.digest() as Uint8Array);
      const sighashHex = '0x' + sighash.toString('hex');

      // === 9. Sign sighash with TEE private key ===
      const teeSigHex: string = await (this.cccSigner as any)._signMessage(sighashHex);
      const teeSigBytes = Buffer.from(teeSigHex.replace(/^0x/, ''), 'hex');

      // === 10. Build final witness[0] with real TEE signature ===
      const finalLock = Buffer.alloc(66);
      finalLock[0] = 0x00;
      teeSigBytes.copy(finalLock, 1);

      const finalWitness0 = ccc.WitnessArgs.from({
        lock: ('0x' + finalLock.toString('hex')) as `0x${string}`,
        inputType: teeProofHex as `0x${string}`,
      });
      preparedTx.setWitnessArgsAt(0, finalWitness0);

      // === 11. Sign secp256k1 fee cell witness manually (same key, different sighash) ===
      // Compute the secp256k1 group sighash: hash(tx_hash || zeroed_witness[feePos])
      // The secp256k1 group does NOT include witness[0] (different lock group).
      for (let fi = 1; fi < preparedTx.inputs.length; fi++) {
        const feeInput = preparedTx.inputs[fi];
        await feeInput.completeExtraInfos(this.cccClient);
        if (!feeInput.cellOutput) continue;

        // Get the existing WitnessArgs at this position (set by prepareTransaction with lock=zeros(65))
        const feeWa = preparedTx.getWitnessArgsAt(fi);
        if (!feeWa) continue;

        // The zeroed version already has lock=zeros(65) (from prepareTransaction)
        const feeWaBytes = Buffer.from(preparedTx.witnesses[fi].replace(/^0x/, ''), 'hex');

        // Compute secp256k1 sighash for this group
        const feeHasher = blake2b(32, null, null, Buffer.from('ckb-default-hash'));
        feeHasher.update(txHashBytes); // same tx_hash
        const feeLenBuf = Buffer.alloc(8);
        feeLenBuf.writeBigUInt64LE(BigInt(feeWaBytes.length));
        feeHasher.update(feeLenBuf);
        feeHasher.update(feeWaBytes);

        // Extra witnesses beyond input count (shared across all groups)
        for (let ei = preparedTx.inputs.length; ei < preparedTx.witnesses.length; ei++) {
          const ew = Buffer.from(preparedTx.witnesses[ei].replace(/^0x/, ''), 'hex');
          const ewl = Buffer.alloc(8);
          ewl.writeBigUInt64LE(BigInt(ew.length));
          feeHasher.update(ewl);
          feeHasher.update(ew);
        }

        const feeSighash = Buffer.from(feeHasher.digest() as Uint8Array);
        const feeSigHex: string = await (this.cccSigner as any)._signMessage('0x' + feeSighash.toString('hex'));
        const feeSigBytes = Buffer.from(feeSigHex.replace(/^0x/, ''), 'hex');

        // Set the secp256k1 signature in witness
        const signedFeeWa = ccc.WitnessArgs.from({
          lock: ('0x' + feeSigBytes.toString('hex')) as `0x${string}`,
        });
        preparedTx.setWitnessArgsAt(fi, signedFeeWa);
        break; // only sign the first fee cell in the group
      }

      // === 12. Submit directly (no signOnlyTransaction) ===
      const txHash = await this.cccClient.sendTransaction(preparedTx);
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
 * Build the TEE proof data for WitnessArgs.inputType.
 *
 * Layout:
 *   [0]                          = path_flag (0x00 for TEE update)
 *   [1..85]                      = public_inputs (84 bytes, little-endian)
 *   [85..117]                    = vk_hash (32 bytes)
 *   [117..121]                   = proof_len (u32 LE)
 *   [121..121+proof_len]         = proof bytes
 *   [121+proof_len..+4]          = journal_len (u32 LE)
 *   [121+proof_len+4..]          = journal bytes (SP1 public values)
 */
function buildTeeProofData(
  publicInputs: SP1PublicInputs,
  vkHash: string,
  proofBytesHex: string,
  publicValuesHex: string,
): string {
  const proofBuf = Buffer.from(proofBytesHex.replace(/^0x/, ''), 'hex');
  const journalBuf = Buffer.from(publicValuesHex.replace(/^0x/, ''), 'hex');
  const totalLen = 1 + 84 + 32 + 4 + proofBuf.length + 4 + journalBuf.length;
  const data = Buffer.alloc(totalLen);
  let offset = 0;

  // path flag
  data.writeUInt8(0x00, offset);
  offset += 1;

  // public inputs (84 bytes, little-endian)
  Buffer.from(publicInputs.programHash.replace(/^0x/, ''), 'hex').copy(data, offset);
  offset += 32;
  Buffer.from(publicInputs.identityCommitment.replace(/^0x/, ''), 'hex').copy(data, offset);
  offset += 32;
  data.writeUInt16LE(publicInputs.previousScore, offset);
  offset += 2;
  data.writeUInt16LE(publicInputs.newScore, offset);
  offset += 2;
  data.writeUInt32LE(publicInputs.epoch, offset);
  offset += 4;
  data.writeUInt16LE(publicInputs.privacyScore, offset);
  offset += 2;
  data.writeUInt16LE(publicInputs.contributionScore, offset);
  offset += 2;
  data.writeUInt16LE(publicInputs.humanityScore, offset);
  offset += 2;
  data.writeUInt16LE(publicInputs.communityScore, offset);
  offset += 2;
  data.writeUInt32LE(publicInputs.prevEpoch, offset);
  offset += 4;

  // vk_hash (32 bytes)
  Buffer.from(vkHash.replace(/^0x/, ''), 'hex').copy(data, offset);
  offset += 32;

  // proof_len (u32 LE) + proof bytes
  data.writeUInt32LE(proofBuf.length, offset);
  offset += 4;
  proofBuf.copy(data, offset);
  offset += proofBuf.length;

  // journal_len (u32 LE) + journal bytes
  data.writeUInt32LE(journalBuf.length, offset);
  offset += 4;
  journalBuf.copy(data, offset);

  return '0x' + data.toString('hex');
}
