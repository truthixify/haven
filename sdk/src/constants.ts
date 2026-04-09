/**
 * Haven Protocol constants.
 *
 * Tier thresholds (section 12), cell layout byte offsets (section 7),
 * and placeholder script code hashes (to be filled after on-chain deployment).
 */

import type { TierName } from './types';

// ---------------------------------------------------------------------------
// Tier thresholds (lower bound, inclusive)
// From spec section 12:
//   Observer  0-199
//   Initiate  200-399
//   Trusted   400-649
//   Guardian  650-849
//   Sovereign 850-1000
// ---------------------------------------------------------------------------

export const TIER_THRESHOLDS: Record<TierName, number> = {
  Observer: 0,
  Initiate: 200,
  Trusted: 400,
  Guardian: 650,
  Sovereign: 850,
} as const;

/**
 * Ordered tier list from lowest to highest.
 * Used when determining the tier for a given score.
 */
export const TIER_ORDER: readonly TierName[] = [
  'Sovereign',
  'Guardian',
  'Trusted',
  'Initiate',
  'Observer',
] as const;

// ---------------------------------------------------------------------------
// Score cell data layout — byte offsets and sizes
// Total: 127 bytes (spec section 7.1)
// ---------------------------------------------------------------------------

export const SCORE_CELL_SIZE = 127;

export const CELL_OFFSETS = {
  VERSION:          { offset: 0,   size: 1  },  // u8
  SCORE:            { offset: 1,   size: 2  },  // u16 LE
  EPOCH:            { offset: 3,   size: 4  },  // u32 LE
  USER_IDENTITY:    { offset: 7,   size: 32 },  // 32 bytes
  PROGRAM_HASH:     { offset: 39,  size: 32 },  // 32 bytes
  PROOF_HASH:       { offset: 71,  size: 32 },  // 32 bytes
  SCORE_BREAKDOWN:  { offset: 103, size: 8  },  // 4 x u16 LE
  ISSUED_AT:        { offset: 111, size: 4  },  // u32 LE
  EXPIRES_AT:       { offset: 115, size: 4  },  // u32 LE
  DEPOSIT_BALANCE:  { offset: 119, size: 8  },  // u64 LE
} as const;

// Breakdown sub-offsets relative to SCORE_BREAKDOWN.offset (103)
export const BREAKDOWN_OFFSETS = {
  PRIVACY:      0,  // u16 LE, max 400
  CONTRIBUTION: 2,  // u16 LE, max 300
  HUMANITY:     4,  // u16 LE, max 200
  COMMUNITY:    6,  // u16 LE, max 100
} as const;

// ---------------------------------------------------------------------------
// Script code hashes — placeholders until on-chain deployment
// ---------------------------------------------------------------------------

/**
 * Haven Score cell type script code hash.
 * Placeholder — will be replaced with the deployed hash.
 */
export const HAVEN_TYPE_SCRIPT_CODE_HASH =
  '0x134e98b02554060a248e337f63eb5a6136c379f41afad9f4bc023c0f3b52d715';

/** Hash type for the Haven Score type script. */
export const HAVEN_TYPE_SCRIPT_HASH_TYPE: 'type' = 'type';

/**
 * Haven Registry cell type script code hash.
 * Placeholder — will be replaced with the deployed hash.
 */
export const HAVEN_REGISTRY_CODE_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000002';

/** Hash type for the Haven Registry type script. */
export const HAVEN_REGISTRY_HASH_TYPE: 'type' = 'type';

/**
 * Haven dual-path lock script code hash.
 * Placeholder — will be replaced with the deployed hash.
 */
export const HAVEN_LOCK_SCRIPT_CODE_HASH =
  '0x296b392e89ec260d8ddc81c3ade5f18bb1d9775f6f9a3885c0ea1fd81d11cf18';

/** Hash type for the Haven lock script. */
export const HAVEN_LOCK_SCRIPT_HASH_TYPE: 'type' = 'type';

// ---------------------------------------------------------------------------
// Registry cell data layout
// ---------------------------------------------------------------------------

export const REGISTRY_CELL_OFFSETS = {
  CURRENT_PROGRAM_HASH:  { offset: 0,   size: 32 },
  PREVIOUS_PROGRAM_HASH: { offset: 32,  size: 32 },
  EPOCH_DURATION:        { offset: 64,  size: 4  },  // u32 LE
  MIN_DEPOSIT:           { offset: 68,  size: 8  },  // u64 LE
  PER_UPDATE_FEE:        { offset: 76,  size: 8  },  // u64 LE
  FEE_ADDRESS:           { offset: 84,  size: 32 },  // 32-byte lock hash
  TIER_OBSERVER:         { offset: 116, size: 2  },  // u16 LE
  TIER_INITIATE:         { offset: 118, size: 2  },  // u16 LE
  TIER_TRUSTED:          { offset: 120, size: 2  },  // u16 LE
  TIER_GUARDIAN:         { offset: 122, size: 2  },  // u16 LE
  TIER_SOVEREIGN:        { offset: 124, size: 2  },  // u16 LE
} as const;

export const REGISTRY_CELL_SIZE = 126;

// ---------------------------------------------------------------------------
// Protocol defaults
// ---------------------------------------------------------------------------

/** Default score expiry window in blocks (~24 hours at 4s per block = 21600 blocks). */
export const DEFAULT_EPOCH_DURATION = 21600;

/** Minimum deposit in shannons (1000 CKBytes = 1000 * 10^8 shannons). */
export const DEFAULT_MIN_DEPOSIT = BigInt(1000_0000_0000);

/** Per-update fee in shannons (~3 CKBytes). */
export const DEFAULT_PER_UPDATE_FEE = BigInt(3_0000_0000);

/** Maximum Haven Score. */
export const MAX_SCORE = 1000;

/** Minimum Haven Score. */
export const MIN_SCORE = 0;

/** Score component maximum values. */
export const MAX_COMPONENT_SCORES = {
  privacy: 400,
  contribution: 300,
  humanity: 200,
  community: 100,
} as const;
