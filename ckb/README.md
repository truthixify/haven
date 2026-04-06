# CKB On-chain Scripts

CKB smart contracts (type script + lock script) for Haven Protocol score cells, plus shared types and integration tests.

## Workspace Structure

```
ckb/
  contracts/
    haven-type-script/    -- validates score cell creation, updates, top-ups, destruction
    haven-lock-script/    -- dual-path ownership: TEE update + user direct control
  haven-types/            -- shared no_std types, cell layouts, error codes
  tests/                  -- on-chain integration tests
  deployment/
    scripts.json          -- deployed script info per network
```

## Type Script (`haven-type-script`)

Validates all operations on Haven Score cells:

- **Creation:** score must be 0, deposit >= minimum from registry, identity commitment set
- **Update (score change):** verifies SP1 PLONK proof against public inputs, checks program hash matches registry (current or previous during grace period), validates epoch increment, fee deduction, breakdown sums to total score
- **Top-up:** deposit_balance increase only, all other fields unchanged
- **Destruction:** cell consumed (no output with same type script)

SP1 proof verification uses [XuJiandong's optimized PLONK verifier fork](https://github.com/XuJiandong/sp1.git) (rev `0cc2b42`) built for CKB's RISC-V target.

## Lock Script (`haven-lock-script`)

Dual-path authorization:

- **Path 0 (TEE Update):** secp256k1 signature from the TEE key (verified against tee_pubkey_hash in lock args) + type script must be present on the output cell. The type script handles proof verification.
- **Path 1 (User Direct):** secp256k1 signature from the user's key (verified against user_pubkey_hash in lock args). Used for deposit top-ups and cell reclaim.

Lock args layout: `user_pubkey_hash (20 bytes) || tee_pubkey_hash (20 bytes)` = 40 bytes total.

## Cell Layouts

### Score Cell (127 bytes)

| Field | Offset | Size | Type |
|-------|--------|------|------|
| version | 0 | 1 | u8 |
| score | 1 | 2 | u16 LE |
| epoch | 3 | 4 | u32 LE |
| user_identity | 7 | 32 | [u8; 32] |
| program_hash | 39 | 32 | [u8; 32] |
| proof_hash | 71 | 32 | [u8; 32] |
| score_breakdown | 103 | 8 | 4x u16 LE (privacy, contribution, humanity, community) |
| issued_at | 111 | 4 | u32 LE |
| expires_at | 115 | 4 | u32 LE |
| deposit_balance | 119 | 8 | u64 LE |

### Registry Cell (139 bytes)

| Field | Offset | Size | Type |
|-------|--------|------|------|
| program_hash | 0 | 32 | [u8; 32] |
| prev_program_hash | 32 | 32 | [u8; 32] |
| epoch_duration | 64 | 4 | u32 LE |
| min_deposit | 68 | 8 | u64 LE |
| per_update_fee | 76 | 8 | u64 LE |
| fee_address | 84 | 32 | [u8; 32] |
| tier_observer | 116 | 2 | u16 LE |
| tier_initiate | 118 | 2 | u16 LE |
| tier_trusted | 120 | 2 | u16 LE |
| tier_guardian | 122 | 2 | u16 LE |
| tier_sovereign | 124 | 2 | u16 LE |
| version | 126 | 1 | u8 |
| grace_epochs | 127 | 4 | u32 LE |
| low_balance_warn | 131 | 8 | u64 LE |

## Testnet Deployment

From `deployment/scripts.json`:

- **haven-type-script code hash:** `0x1193537cffa570e905d47ce971a166720e07773f188bce6a1dafd2740e892a37`
- **hash type:** `type`
- **cell dep tx hash:** `0xdec5fba84ef56bcb3ee9f2db791183a7bfe8187dd462e8919a35348d4970448c` (index 0)

## Build

```bash
make prepare    # install riscv64imac-unknown-none-elf target
make build      # build all contracts to build/release/
```

Build a single contract:

```bash
make build CONTRACT=haven-type-script
```

## Deploy

```bash
offckb deploy --network testnet --target build/release/haven-type-script --type-id --privkey <key>
offckb deploy --network testnet --target build/release/haven-lock-script --type-id --privkey <key>
```

## Test

```bash
make test
```

Or with cargo directly:

```bash
cargo test
```
