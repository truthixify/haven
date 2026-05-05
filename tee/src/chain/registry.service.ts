import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { RegistryCellData, TierThresholds } from '../common/types';
import {
  DEFAULT_UPDATE_FEE,
  MIN_CELL_CAPACITY,
  DEFAULT_EPOCH_DURATION_BLOCKS,
  TIER_THRESHOLDS,
} from '../common/constants';

/**
 * Registry Service
 *
 * Reads the Haven Registry cell from CKB to get the current:
 * - Valid scoring program hash
 * - Previous program hash (for grace period)
 * - Fee amounts
 * - Tier thresholds
 * - Epoch duration
 *
 * The Registry cell is a single global cell controlled by the Haven
 * Protocol multisig. It is the source of truth for protocol parameters.
 */
@Injectable()
export class RegistryService implements OnModuleInit {
  private readonly logger = new Logger(RegistryService.name);
  private rpcClient!: AxiosInstance;

  /** Cached registry data (refreshed before each scoring cycle) */
  private cachedRegistry: RegistryCellData | null = null;
  private cacheTimestamp = 0;
  private readonly cacheTtlMs = 60_000; // 1 minute cache

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const rpcUrl = this.config.get<string>('ckb.rpcUrl');
    this.rpcClient = axios.create({
      baseURL: rpcUrl,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    });
  }

  /**
   * Get current registry data.
   * Uses a cached value if fresh enough, otherwise reads from CKB.
   */
  async getRegistryData(): Promise<RegistryCellData | null> {
    const now = Date.now();

    if (this.cachedRegistry && now - this.cacheTimestamp < this.cacheTtlMs) {
      return this.cachedRegistry;
    }

    try {
      const registryTxHash = this.config.get<string>(
        'haven.registryTxHash',
      );
      const registryIndex = this.config.get<number>(
        'haven.registryIndex',
      );

      if (!registryTxHash || registryTxHash === '0'.repeat(66)) {
        this.logger.warn(
          'Registry cell not configured - using defaults',
        );
        return this.getDefaultRegistry();
      }

      // Fetch the registry cell from CKB
      const cell = await this.fetchCell(registryTxHash, registryIndex ?? 0);

      if (!cell) {
        this.logger.warn(
          'Registry cell not found on-chain - using defaults',
        );
        return this.getDefaultRegistry();
      }

      // Parse the registry cell data
      const registry = this.parseRegistryCellData(cell.data);
      this.cachedRegistry = registry;
      this.cacheTimestamp = now;

      this.logger.debug('Registry data refreshed from CKB');

      return registry;
    } catch (error) {
      this.logger.error('Failed to read registry cell', error);
      return this.getDefaultRegistry();
    }
  }

  /**
   * Get the current valid program hash.
   */
  async getCurrentProgramHash(): Promise<Buffer> {
    const registry = await this.getRegistryData();
    return registry?.currentProgramHash ?? Buffer.alloc(32);
  }

  /**
   * Get the per-update fee.
   */
  async getUpdateFee(): Promise<bigint> {
    const registry = await this.getRegistryData();
    return registry?.perUpdateFee ?? DEFAULT_UPDATE_FEE;
  }

  /**
   * Get the minimum deposit amount.
   */
  async getMinimumDeposit(): Promise<bigint> {
    const registry = await this.getRegistryData();
    return registry?.minimumDeposit ?? MIN_CELL_CAPACITY;
  }

  /**
   * Get the epoch duration in blocks.
   */
  async getEpochDurationBlocks(): Promise<number> {
    const registry = await this.getRegistryData();
    return registry?.epochDurationBlocks ?? DEFAULT_EPOCH_DURATION_BLOCKS;
  }

  /**
   * Get the current tip block number from CKB.
   */
  async getTipBlockNumber(): Promise<number> {
    try {
      const response = await this.rpcClient.post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'get_tip_block_number',
        params: [],
      });

      const tipHex = response.data?.result;
      return tipHex ? parseInt(tipHex, 16) : 0;
    } catch (error) {
      this.logger.error('Failed to get tip block number', error);
      return 0;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Fetch a specific cell from CKB by transaction hash and index.
   */
  private async fetchCell(
    txHash: string,
    index: number,
  ): Promise<{ data: string } | null> {
    try {
      const response = await this.rpcClient.post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'get_transaction',
        params: [txHash],
      });

      const tx = response.data?.result?.transaction;
      if (!tx || !tx.outputs_data || index >= tx.outputs_data.length) {
        return null;
      }

      return { data: tx.outputs_data[index] };
    } catch (error) {
      this.logger.error('Failed to fetch cell', error);
      return null;
    }
  }

  /**
   * Parse the registry cell data from hex.
   *
   * Registry cell layout (171 bytes):
   * [0..32]    current program hash
   * [32..64]   previous program hash
   * [64..68]   epoch duration (u32 LE)
   * [68..76]   minimum deposit (u64 LE)
   * [76..84]   per-update fee (u64 LE)
   * [84..116]  fee address (32 bytes)
   * [116..126] tier thresholds (5 x u16 LE)
   * [126]      version (u8)
   * [127..131] grace epochs (u32 LE)
   * [131..139] low balance threshold (u64 LE)
   * [139..171] vk_hash (32 bytes)
   */
  private parseRegistryCellData(hexData: string): RegistryCellData {
    const data = Buffer.from(hexData.replace(/^0x/, ''), 'hex');

    if (data.length < 139) {
      this.logger.warn(
        `Registry cell data too short: ${data.length} bytes (expected >= 139)`,
      );
      return this.getDefaultRegistry();
    }

    const currentProgramHash = Buffer.from(data.subarray(0, 32));
    const previousProgramHash = Buffer.from(data.subarray(32, 64));
    const epochDurationBlocks = data.readUInt32LE(64);
    const minimumDeposit = data.readBigUInt64LE(68);
    const perUpdateFee = data.readBigUInt64LE(76);
    const protocolFeeAddress = '0x' + data.subarray(84, 116).toString('hex');

    const tierThresholds: TierThresholds = {
      observer: data.readUInt16LE(116),
      initiate: data.readUInt16LE(118),
      trusted: data.readUInt16LE(120),
      guardian: data.readUInt16LE(122),
      sovereign: data.readUInt16LE(124),
    };

    // vk_hash at offset 139 (32 bytes) — may not exist in older registries
    const vkHash = data.length >= 171
      ? Buffer.from(data.subarray(139, 171))
      : Buffer.alloc(32);

    return {
      currentProgramHash,
      previousProgramHash,
      epochDurationBlocks,
      minimumDeposit,
      perUpdateFee,
      protocolFeeAddress,
      tierThresholds,
      vkHash,
    };
  }

  /**
   * Return default registry values for development/testing.
   */
  /**
   * Get the SP1 verification key hash from the registry.
   */
  async getVkHash(): Promise<Buffer> {
    const registry = await this.getRegistryData();
    return registry?.vkHash ?? Buffer.alloc(32);
  }

  private getDefaultRegistry(): RegistryCellData {
    return {
      currentProgramHash: Buffer.alloc(32),
      previousProgramHash: Buffer.alloc(32),
      epochDurationBlocks: DEFAULT_EPOCH_DURATION_BLOCKS,
      minimumDeposit: MIN_CELL_CAPACITY,
      perUpdateFee: DEFAULT_UPDATE_FEE,
      protocolFeeAddress: '0x' + '0'.repeat(40),
      tierThresholds: {
        observer: TIER_THRESHOLDS.OBSERVER,
        initiate: TIER_THRESHOLDS.INITIATE,
        trusted: TIER_THRESHOLDS.TRUSTED,
        guardian: TIER_THRESHOLDS.GUARDIAN,
        sovereign: TIER_THRESHOLDS.SOVEREIGN,
      },
      vkHash: Buffer.alloc(32),
    };
  }
}
