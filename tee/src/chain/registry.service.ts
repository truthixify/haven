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
   * Registry cell layout:
   * [32 bytes: current program hash]
   * [32 bytes: previous program hash]
   * [4 bytes: epoch duration in blocks (u32 LE)]
   * [8 bytes: minimum deposit (u64 LE)]
   * [8 bytes: per-update fee (u64 LE)]
   * [20 bytes: protocol fee address (blake160 hash)]
   * [10 bytes: tier thresholds (5 x u16 LE)]
   * Total: 114 bytes
   */
  private parseRegistryCellData(hexData: string): RegistryCellData {
    const data = Buffer.from(hexData.replace(/^0x/, ''), 'hex');

    if (data.length < 114) {
      this.logger.warn(
        `Registry cell data too short: ${data.length} bytes (expected 114)`,
      );
      return this.getDefaultRegistry();
    }

    let offset = 0;

    const currentProgramHash = data.subarray(offset, offset + 32);
    offset += 32;

    const previousProgramHash = data.subarray(offset, offset + 32);
    offset += 32;

    const epochDurationBlocks = data.readUInt32LE(offset);
    offset += 4;

    const minimumDeposit = data.readBigUInt64LE(offset);
    offset += 8;

    const perUpdateFee = data.readBigUInt64LE(offset);
    offset += 8;

    const protocolFeeAddress =
      '0x' + data.subarray(offset, offset + 20).toString('hex');
    offset += 20;

    const tierThresholds: TierThresholds = {
      observer: data.readUInt16LE(offset),
      initiate: data.readUInt16LE(offset + 2),
      trusted: data.readUInt16LE(offset + 4),
      guardian: data.readUInt16LE(offset + 6),
      sovereign: data.readUInt16LE(offset + 8),
    };

    return {
      currentProgramHash: Buffer.from(currentProgramHash),
      previousProgramHash: Buffer.from(previousProgramHash),
      epochDurationBlocks,
      minimumDeposit,
      perUpdateFee,
      protocolFeeAddress,
      tierThresholds,
    };
  }

  /**
   * Return default registry values for development/testing.
   */
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
    };
  }
}
