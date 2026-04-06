import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import blake2b from 'blake2b';
import { OnChainActivity } from '../../common/types';

/**
 * On-Chain Activity Collector
 *
 * Fetches CKB on-chain activity using the CKB indexer API.
 * The CKB testnet indexer is integrated into the RPC node, so we use the
 * main RPC URL (not a separate indexer URL) for both RPC and indexer calls.
 *
 * Analyzes transaction history, address rotation patterns,
 * shielded pool usage, and privacy protocol interactions.
 *
 * All data collected here stays within the TEE and is discarded
 * after scoring.
 */

/** Default secp256k1-blake160 lock script code hash */
const SECP256K1_CODE_HASH =
  '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8';

/** Nervos DAO type script code hash */
const DAO_TYPE_CODE_HASH =
  '0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e';

@Injectable()
export class OnChainCollector {
  private readonly logger = new Logger(OnChainCollector.name);
  private rpcClient!: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    // Use the main RPC URL — CKB testnet has indexer methods built into the RPC node
    const rpcUrl = this.config.get<string>('ckb.rpcUrl');
    this.rpcClient = axios.create({
      baseURL: rpcUrl,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  }

  /**
   * Collect on-chain activity for a user.
   *
   * @param ckbPubKey - User's CKB public key (hex) or CKB address string
   * @returns On-chain activity data for scoring, or default empty activity
   */
  async collect(
    ckbPubKey: string,
    lockScript?: { codeHash?: string; hashType?: string; args?: string },
  ): Promise<OnChainActivity> {
    try {
      // Use the actual lock script if provided, otherwise derive from pubkey
      let queryCodeHash = SECP256K1_CODE_HASH;
      let queryHashType = 'type';
      let queryArgs: string;

      if (lockScript?.codeHash && lockScript?.args) {
        queryCodeHash = lockScript.codeHash;
        queryHashType = lockScript.hashType || 'type';
        queryArgs = lockScript.args;
        this.logger.log(
          `Using stored lock script: code_hash=${queryCodeHash.substring(0, 12)}... args=${queryArgs.substring(0, 12)}...`,
        );
      } else {
        queryArgs = this.deriveLockArgs(ckbPubKey);
        this.logger.log(
          `Derived lock args: ${queryArgs} (from key: ${ckbPubKey.substring(0, 16)}...)`,
        );
      }

      // Verify the RPC is reachable
      const tipBlock = await this.getTipBlockNumber();
      if (tipBlock === null) {
        this.logger.warn('CKB RPC unreachable — returning empty activity');
        return this.emptyActivity();
      }

      this.logger.log(`CKB tip block: ${tipBlock}`);

      // Query transactions and cells using the CKB indexer
      const transactions = await this.getTransactions(queryArgs, queryCodeHash, queryHashType);
      const cells = await this.getLiveCells(queryArgs, queryCodeHash, queryHashType);

      this.logger.log(`Found ${transactions.length} transactions, ${cells.length} live cells for ${queryArgs.substring(0, 12)}...`);

      // Analyze transaction patterns
      const totalTransactions = transactions.length;

      // Recent transactions (last 30 days, estimated by block height)
      const recentTransactions = this.countRecentTransactions(
        transactions,
        30,
        tipBlock,
      );

      // Unique addresses interacted with (unique tx hashes as proxy)
      const uniqueAddressesUsed = this.countUniqueAddresses(transactions);

      // Shielded pool usage (transactions with specific privacy protocol type scripts)
      const shieldedPoolUsage = this.countShieldedPoolUsage(transactions);

      // Privacy protocol balances (cells with privacy type scripts)
      const privacyProtocolBalances =
        this.sumPrivacyProtocolBalances(cells);

      // Address rotation: how many distinct lock scripts this identity has used
      const addressRotationCount =
        this.countAddressRotations(transactions);

      // Active cells
      const cellCount = cells.length;

      // Nervos DAO deposits
      const daoDeposits = this.countDaoDeposits(cells);

      // Account age estimated from first transaction
      const accountAgeDays = this.estimateAccountAge(transactions, tipBlock);

      const activity: OnChainActivity = {
        totalTransactions,
        recentTransactions,
        uniqueAddressesUsed,
        shieldedPoolUsage,
        privacyProtocolBalances,
        addressRotationCount,
        cellCount,
        daoDeposits,
        accountAgeDays,
      };

      this.logger.debug(
        `On-chain activity collected: ${totalTransactions} total txs, ${cellCount} live cells, ${daoDeposits} DAO deposits, age ~${accountAgeDays}d`,
      );

      return activity;
    } catch (error) {
      this.logger.error('Failed to collect on-chain activity', error);

      // Return empty activity on failure - user gets zero on-chain score
      return this.emptyActivity();
    }
  }

  // -----------------------------------------------------------------------
  // CKB RPC / Indexer Queries
  // -----------------------------------------------------------------------

  /**
   * Verify the RPC is reachable by fetching the tip block number.
   */
  private async getTipBlockNumber(): Promise<number | null> {
    try {
      const response = await this.rpcClient.post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'get_tip_block_number',
        params: [],
      });

      const hex = response.data?.result;
      return hex ? parseInt(hex, 16) : null;
    } catch (error) {
      this.logger.error('CKB RPC get_tip_block_number failed', error);
      return null;
    }
  }

  private async getTransactions(lockArgs: string, codeHash = SECP256K1_CODE_HASH, hashType = 'type'): Promise<any[]> {
    try {
      const response = await this.rpcClient.post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'get_transactions',
        params: [
          {
            script: {
              code_hash: codeHash,
              hash_type: hashType,
              args: lockArgs,
            },
            script_type: 'lock',
            group_by_transaction: true,
          },
          'asc',
          '0x3e8',
        ],
      });

      return response.data?.result?.objects ?? [];
    } catch (error) {
      this.logger.error('CKB indexer get_transactions failed', error);
      return [];
    }
  }

  private async getLiveCells(lockArgs: string, codeHash = SECP256K1_CODE_HASH, hashType = 'type'): Promise<any[]> {
    try {
      const response = await this.rpcClient.post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'get_cells',
        params: [
          {
            script: {
              code_hash: codeHash,
              hash_type: hashType,
              args: lockArgs,
            },
            script_type: 'lock',
          },
          'asc',
          '0x64', // limit: 100
        ],
      });

      return response.data?.result?.objects ?? [];
    } catch (error) {
      this.logger.error('CKB indexer get_cells failed', error);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Lock Args Derivation
  // -----------------------------------------------------------------------

  /**
   * Derive lock script args from either a CKB public key (hex) or a CKB address.
   *
   * - If the input starts with `ckt1` or `ckb1`: it is a CKB address string.
   *   We decode the lock args from the address. For the new CKB address format,
   *   the payload after the prefix encodes the lock script. We extract the
   *   20-byte lock args (blake160 of the pubkey) from the bech32m-decoded payload.
   *   As a pragmatic fallback, if decoding fails, we hash the address string.
   *
   * - If the input starts with `0x`: it is a hex-encoded public key.
   *   We compute blake160(blake2b-256(pubkey)) — the standard secp256k1-blake160
   *   derivation used by CKB's default lock script.
   */
  private deriveLockArgs(ckbPubKey: string): string {
    if (ckbPubKey.startsWith('ckt1') || ckbPubKey.startsWith('ckb1')) {
      return this.lockArgsFromAddress(ckbPubKey);
    }

    // Check the hex length to determine what we have
    const hex = ckbPubKey.startsWith('0x') ? ckbPubKey.slice(2) : ckbPubKey;

    if (hex.length === 40) {
      // 20 bytes = this IS already the lock args (blake160)
      this.logger.debug(`ckbPubKey is already 20-byte lock args: 0x${hex.substring(0, 8)}...`);
      return '0x' + hex;
    }

    if (hex.length === 66) {
      // 33 bytes = compressed public key, derive lock args
      this.logger.debug(`ckbPubKey is 33-byte compressed pubkey, deriving lock args`);
      return this.lockArgsFromHexPubkey(ckbPubKey);
    }

    // Unknown format — try hashing it
    this.logger.warn(`Unknown ckbPubKey format (${hex.length} hex chars), hashing as fallback`);
    return this.lockArgsFromHexPubkey(ckbPubKey);
  }

  /**
   * Extract lock args from a CKB address.
   *
   * CKB uses bech32/bech32m addresses. The new full format (`ckt1qz...`)
   * encodes: code_hash (32 bytes) + hash_type (1 byte) + args (20 bytes for secp256k1).
   *
   * For the short format (`ckt1qyq...`), the payload directly contains the 20-byte args.
   *
   * We try to extract the args from the address. If the address doesn't decode
   * cleanly, we fall back to hashing the address string itself with blake2b and
   * taking the first 20 bytes — this won't match the real lock args but avoids
   * a crash.
   */
  private lockArgsFromAddress(address: string): string {
    try {
      // CKB addresses use bech32/bech32m encoding.
      // After removing the human-readable prefix (ckt1/ckb1), decode the data part.
      // The payload structure depends on the format type byte.

      // For the common short secp256k1 address format (ckt1qyq / ckt1qz):
      // We can extract the 20-byte args directly from the address.
      // The address encodes: format_type (1 byte) + code_hash_index_or_code_hash + args

      // Simple approach: use bech32 decode
      const decoded = this.bech32Decode(address);
      if (decoded && decoded.length >= 20) {
        // For short format addresses (format type 0x01), the args start at byte 1
        // For full format addresses (format type 0x00 or 0x02/0x04), args start at byte 33 (after code_hash + hash_type)
        const formatType = decoded[0];

        if (formatType === 0x01) {
          // Short format: 1 byte format + 1 byte code_hash_index + 20 bytes args
          if (decoded.length >= 22) {
            const args = decoded.slice(2, 22);
            return '0x' + Buffer.from(args).toString('hex');
          }
        } else if (
          formatType === 0x00 ||
          formatType === 0x02 ||
          formatType === 0x04
        ) {
          // Full format: 1 byte format + 32 bytes code_hash + 1 byte hash_type + args
          if (decoded.length >= 54) {
            const args = decoded.slice(34, 54);
            return '0x' + Buffer.from(args).toString('hex');
          }
        }
      }

      // Fallback: hash the address string and take 20 bytes
      this.logger.warn(
        `Could not decode CKB address format, falling back to hash: ${address.substring(0, 20)}...`,
      );
      return this.hashToBlake160(Buffer.from(address, 'utf-8'));
    } catch (error) {
      this.logger.warn(
        `Failed to decode CKB address, using hash fallback: ${error}`,
      );
      return this.hashToBlake160(Buffer.from(address, 'utf-8'));
    }
  }

  /**
   * Bech32/Bech32m decode — extract the data payload from a bech32-encoded address.
   * Returns the decoded byte array (5-bit to 8-bit converted) or null on failure.
   */
  private bech32Decode(address: string): Uint8Array | null {
    try {
      // Find the separator (last '1' in the string)
      const sepIndex = address.lastIndexOf('1');
      if (sepIndex < 1) return null;

      const dataStr = address.substring(sepIndex + 1);
      // Remove the 6-character checksum
      const dataWithoutChecksum = dataStr.substring(
        0,
        dataStr.length - 6,
      );

      const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
      const values: number[] = [];
      for (const char of dataWithoutChecksum) {
        const idx = BECH32_CHARSET.indexOf(char);
        if (idx === -1) return null;
        values.push(idx);
      }

      // Convert 5-bit values to 8-bit bytes
      return this.convertBits(values, 5, 8, false);
    } catch {
      return null;
    }
  }

  /**
   * Convert between bit-width representations (used in bech32 encoding).
   */
  private convertBits(
    data: number[],
    fromBits: number,
    toBits: number,
    pad: boolean,
  ): Uint8Array | null {
    let acc = 0;
    let bits = 0;
    const result: number[] = [];
    const maxV = (1 << toBits) - 1;

    for (const value of data) {
      if (value < 0 || value >> fromBits !== 0) return null;
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        result.push((acc >> bits) & maxV);
      }
    }

    if (pad) {
      if (bits > 0) {
        result.push((acc << (toBits - bits)) & maxV);
      }
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxV) !== 0) {
      // Bits remaining that don't fit — this is acceptable for our purpose
    }

    return new Uint8Array(result);
  }

  /**
   * Compute blake160 from a hex-encoded public key string.
   * blake160(pubkey) = first 20 bytes of blake2b-256(pubkey)
   */
  private lockArgsFromHexPubkey(hexPubKey: string): string {
    const stripped = hexPubKey.startsWith('0x')
      ? hexPubKey.slice(2)
      : hexPubKey;
    const pubKeyBytes = Buffer.from(stripped, 'hex');
    return this.hashToBlake160(pubKeyBytes);
  }

  /**
   * Compute blake160: first 20 bytes of blake2b-256 hash.
   */
  private hashToBlake160(data: Buffer): string {
    const hash = blake2b(32, undefined, undefined, Buffer.from('ckb-default-hash'));
    hash.update(data);
    const fullHash = Buffer.from(hash.digest()).toString('hex');
    // blake160 = first 20 bytes = 40 hex chars
    return '0x' + fullHash.substring(0, 40);
  }

  // -----------------------------------------------------------------------
  // Analysis Helpers
  // -----------------------------------------------------------------------

  private countRecentTransactions(
    transactions: any[],
    daysBack: number,
    tipBlock: number,
  ): number {
    // CKB produces a block roughly every 8 seconds.
    // 30 days ~ 324,000 blocks.
    const blocksBack = Math.floor((daysBack * 24 * 60 * 60) / 8);

    if (transactions.length === 0) return 0;

    const cutoff = tipBlock - blocksBack;

    return transactions.filter((tx: any) => {
      const blockNum = tx.block_number
        ? parseInt(tx.block_number, 16)
        : 0;
      return blockNum >= cutoff;
    }).length;
  }

  private countUniqueAddresses(transactions: any[]): number {
    // With group_by_transaction: true, each object is a transaction group.
    // Count unique tx hashes as a proxy for interaction diversity.
    const txHashes = new Set<string>();

    for (const tx of transactions) {
      const hash = tx.tx_hash ?? '';
      if (hash) txHashes.add(hash);
    }

    return txHashes.size;
  }

  private countShieldedPoolUsage(transactions: any[]): number {
    // Count transactions interacting with known privacy protocol type scripts.
    // In production, this would check against a curated list of privacy
    // protocol type script code hashes.
    // For now, return 0 — will be populated when privacy protocols are
    // deployed on CKB and their type script hashes are registered.
    return 0;
  }

  private sumPrivacyProtocolBalances(cells: any[]): bigint {
    // Sum CKBytes in cells with privacy protocol type scripts.
    // Similar to shieldedPoolUsage, this requires a curated list
    // of privacy protocol type scripts.
    return BigInt(0);
  }

  private countAddressRotations(transactions: any[]): number {
    // With group_by_transaction mode, count unique transaction hashes
    // as a proxy for address rotation behavior.
    const inputTxs = new Set<string>();

    for (const tx of transactions) {
      const hash = tx.tx_hash ?? '';
      if (hash) inputTxs.add(hash);
    }

    // Address rotations approximated by unique transaction count
    // (more transactions suggest more address usage patterns)
    return Math.min(inputTxs.size, 100);
  }

  private countDaoDeposits(cells: any[]): number {
    return cells.filter((cell: any) => {
      const typeScript = cell.output?.type;
      return typeScript?.code_hash === DAO_TYPE_CODE_HASH;
    }).length;
  }

  private estimateAccountAge(
    transactions: any[],
    tipBlock: number,
  ): number {
    if (transactions.length === 0) return 0;

    // Find the earliest block number
    const minBlock = Math.min(
      ...transactions.map((tx: any) => {
        const blockNum = tx.block_number;
        return blockNum ? parseInt(blockNum, 16) : Number.MAX_SAFE_INTEGER;
      }),
    );

    if (minBlock === Number.MAX_SAFE_INTEGER) return 0;

    // Estimate days from earliest transaction to current tip at ~8 seconds/block
    const blockDiff = tipBlock - minBlock;
    const secondsDiff = blockDiff * 8;
    const daysDiff = Math.floor(secondsDiff / (60 * 60 * 24));

    return Math.max(daysDiff, 1);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private emptyActivity(): OnChainActivity {
    return {
      totalTransactions: 0,
      recentTransactions: 0,
      uniqueAddressesUsed: 0,
      shieldedPoolUsage: 0,
      privacyProtocolBalances: BigInt(0),
      addressRotationCount: 0,
      cellCount: 0,
      daoDeposits: 0,
      accountAgeDays: 0,
    };
  }
}
