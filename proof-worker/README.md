# Haven Proof Worker

Stateless Rust HTTP service that generates a ZK proof (SP1 PLONK) verifying that the TEE correctly executed the scoring computation for each user. The Phala TEE sends a hex-encoded TDX attestation quote containing the scoring result, and the proof worker returns an SP1 PLONK proof that guarantees the TEE ran the scoring program honestly -- computing each component score (privacy, contribution, humanity, community) correctly from the collected activity data and producing the final score without tampering. This proof can be verified on-chain by CKB's type script.

The proof worker has no database, no sessions, and no user data. It verifies the DCAP attestation (which proves the computation ran in a genuine TEE) and produces a ZK proof of correct score computation.

## Tech Stack

- **Framework:** Axum 0.7 (Tokio async runtime)
- **Proof system:** automata-dcap-zkvm with SP1 backend (PLONK by default, Groth16 optional)
- **Collateral fetching:** Alloy Ethereum provider for on-chain PCCS
- **Hashing:** blake2b-rs (CKB-ecosystem Blake2b with "haven-protocol00" personalization)

## How It Works

1. TEE service sends a `POST /prove` request with a hex-encoded TDX quote and public inputs (epoch, scores, identity, program hash)
2. Proof worker validates the quote and public inputs (scores 0-1000, epoch ordering, hex field lengths)
3. Fetches DCAP collaterals from Automata's on-chain PCCS via Ethereum RPC
4. Generates an SP1 proof (PLONK or Groth16) via SP1 Network remote proving
5. Returns proof bytes, public values (journal), proof hash (Blake2b), program ID, and vk_hash

The proof verifies the full TDX quote including signature chain, Intel certificate chain, TCB status, and collateral freshness -- guaranteeing that the scoring computation ran inside a genuine TEE and was executed correctly.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/prove` | Generate SP1 DCAP proof from TDX attestation quote |
| GET | `/health` | Health check (returns status, version, proof system) |

### POST /prove Request Body

```json
{
  "attestation_quote": "0x...",
  "public_inputs": {
    "program_hash": "hex (32 bytes)",
    "user_identity": "hex (32 bytes)",
    "prev_score": 500,
    "new_score": 650,
    "epoch": 10,
    "prev_epoch": 9,
    "privacy_score": 200,
    "contribution_score": 200,
    "humanity_score": 150,
    "community_score": 100
  }
}
```

### POST /prove Response

```json
{
  "proof": "hex-encoded SP1 proof bytes",
  "public_values": "hex-encoded journal",
  "proof_hash": "hex-encoded Blake2b hash of proof",
  "program_id": "SP1 program identifier",
  "vk_hash": "SP1 verification key hash (used by on-chain PLONK verifier)"
}
```

## Setup

### Prerequisites

- Rust toolchain (stable)
- SP1 toolchain (for remote proving via SP1 Network)
- An SP1 Network account and private key from [network.succinct.xyz](https://network.succinct.xyz)
- Ethereum RPC URL for a chain where Automata has deployed PCCS contracts

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|----------|-------------|---------|
| `SP1_PRIVATE_KEY` | SP1 Network private key for remote proving | **required** |
| `DCAP_PROOF_SYSTEM` | Proof system: `plonk` (for CKB on-chain verification) or `groth16` | `plonk` |
| `DCAP_NETWORK_MODE` | SP1 Network prover mode: `auction`, `hosted`, or `reserved` | `auction` |
| `AUTOMATA_RPC_URL` | Ethereum RPC URL for DCAP collateral fetching from on-chain PCCS | **required** |
| `PORT` | HTTP server port | `3001` |

Automata PCCS contract addresses:
- Ethereum Sepolia: `0x8e480c9879F1Db31dC209e5f4d239d5126e6e07B`
- Ethereum Mainnet: `0xE2Cd5aA44a0896D683684B8EA15eB54B269fC933`
- Base Sepolia: `0xa4615C2a260413878241ff7605AD9577feB356A5`
- Arbitrum Sepolia: `0xa4615C2a260413878241ff7605AD9577feB356A5`

### Build

```bash
cargo build --release
```

### Run

```bash
RUST_LOG=info ./target/release/proof-worker
```

The service runs on port **3001** by default.
