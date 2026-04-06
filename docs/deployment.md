# Haven Protocol -- Deployment Guide

This guide covers deploying all Haven Protocol components: CKB on-chain scripts, TEE service, proof worker, and dashboard.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [CKB Scripts](#ckb-scripts)
- [Registry Cell](#registry-cell)
- [TEE Service](#tee-service)
- [Proof Worker](#proof-worker)
- [Dashboard](#dashboard)
- [Environment Variables Reference](#environment-variables-reference)

---

## Prerequisites

### Accounts and Keys

- **SP1 Network key:** Register at [https://network.succinct.xyz](https://network.succinct.xyz) and generate a private key for proof generation
- **Phala dstack account:** Access to Phala Network's TEE deployment infrastructure
- **CKB testnet funds:** Obtain testnet CKBytes from the Pudge testnet faucet
- **Twitter OAuth 2.0 credentials:** Create a Twitter developer app with OAuth 2.0 enabled
- **GitHub OAuth credentials:** Create a GitHub OAuth app
- **Ethereum RPC endpoint:** For fetching DCAP collaterals from Automata's on-chain PCCS contracts (Sepolia for testnet, mainnet for production)

### Tooling

- **Rust** (stable + nightly): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **RISC-V target**: `rustup target add riscv64imac-unknown-none-elf`
- **SP1 toolchain**: `curl -L https://sp1up.dev | bash && ~/.sp1/bin/sp1up`
- **Node.js** >= 18
- **Docker** and **Docker Compose**: for running PostgreSQL
- **CKB CLI**: [https://github.com/nervosnetwork/ckb-cli](https://github.com/nervosnetwork/ckb-cli) -- for deploying scripts and creating cells on CKB
- **offckb** (optional): [https://github.com/nicognaW/offckb](https://github.com/nicognaW/offckb) -- simplified CKB script deployment tool

---

## CKB Scripts

### Build

Build the type script and lock script RISC-V binaries:

```bash
cd ckb
make prepare    # Install riscv64imac-unknown-none-elf target
make build      # Build all contracts in release mode
```

Binaries are output to `ckb/build/release/`:
- `haven-type-script` -- Score update verification (SP1 proof, rules, top-up check)
- `haven-lock-script` -- Dual-path lock (TEE update + user control)

Verify build integrity:
```bash
make checksum   # Generates build/checksums-release.txt
```

### Deploy to CKB Testnet

Scripts are deployed with type-id (upgradable). You can use `ckb-cli` or `offckb`:

**Using offckb:**

```bash
offckb deploy --network testnet --binary build/release/haven-type-script
offckb deploy --network testnet --binary build/release/haven-lock-script
```

**Using ckb-cli:**

```bash
ckb-cli deploy gen-txs \
  --deployment-config deployment.toml \
  --migration-dir migrations/ \
  --from-address <YOUR_CKB_ADDRESS> \
  --info-file type-script-info.json
```

Record the deployed code hashes and out points. You will need these for:
- TEE service configuration (`HAVEN_TYPE_SCRIPT_CODE_HASH`)
- SDK constants (`constants.ts`)
- Dashboard configuration (`src/config.ts`)
- Registry cell creation

### Current Testnet Deployment

The scripts are deployed on CKB testnet with the following hashes (from `ckb/deployment/scripts.json`):

| Script | Code Hash | Hash Type | Cell Dep TX Hash | Index |
|--------|-----------|-----------|-----------------|-------|
| haven-type-script | `0x1193537cffa570e905d47ce971a166720e07773f188bce6a1dafd2740e892a37` | `type` | `0xdec5fba84ef56bcb3ee9f2db791183a7bfe8187dd462e8919a35348d4970448c` | `0` |

### Run Tests

```bash
cd ckb
make test       # Runs integration tests against the compiled scripts
```

---

## Registry Cell

The Haven Registry cell is a single global cell that stores protocol configuration. It must be created after the scripts are deployed.

### Registry Cell Content

The Registry cell data (139 bytes) contains:

| Field | Description | Example Value |
|-------|-------------|---------------|
| `program_hash` | Current SP1 scoring program hash | (computed from your scoring program binary) |
| `prev_program_hash` | Previous program hash (zero for initial deploy) | `0x00...00` |
| `epoch_duration` | Score expiry in CKB blocks | `21600` (~24 hours at 4s/block) |
| `min_deposit` | Minimum CKBytes to create a score cell | `200_0000_0000` (200 CKB in shannons) |
| `per_update_fee` | Fee per score update | `3_0000_0000` (~3 CKB in shannons) |
| `fee_address` | Protocol fee recipient lock hash | (your multisig lock hash) |
| `tier_*` | Tier thresholds | 0, 200, 400, 650, 850 |
| `version` | Registry schema version | `1` |
| `grace_epochs` | Epochs to accept previous program hash | `2` |
| `low_balance_threshold` | Low-balance warning threshold | `20_0000_0000` (20 CKB) |

### Create the Registry Cell

Build a CKB transaction that creates a cell with:
- **Type script:** The Haven Registry type script with your deployed code hash
- **Lock script:** A multisig lock (controlled by your team) for future updates
- **Data:** The 139-byte registry configuration, serialized in little-endian format
- **Capacity:** Sufficient to hold the data (~200 CKBytes minimum)

Record the Registry cell out point (`tx_hash:index`) for the TEE service configuration.

### Updating the Registry

To update protocol parameters (e.g., change the program hash after a scoring formula update):

1. Build a transaction consuming the current Registry cell
2. Create a new Registry cell with updated data
3. Sign with the multisig
4. During program hash transitions, set `prev_program_hash` to the old hash and `grace_epochs` to the number of epochs to accept both hashes

---

## TEE Service

The TEE service runs inside Phala's dstack (managed TEE infrastructure) with a co-located PostgreSQL database.

### Local Development

1. **Start PostgreSQL:**

```bash
cd tee
docker compose up -d    # Starts PostgreSQL 16 on port 5432
```

2. **Set up the dstack simulator:**

For local development without a real Phala TEE:

```bash
git clone https://github.com/Dstack-TEE/dstack.git
cd dstack/sdk/simulator
./build.sh
./dstack-simulator    # Starts on http://localhost:8090
```

3. **Configure and run the TEE service:**

```bash
cd tee
cp .env.example .env   # Edit with your values (see below)
npm install
npm run start:dev      # Starts NestJS on port 3000 with hot reload
```

Set `DSTACK_ENDPOINT=http://localhost:8090` in `.env` to use the simulator.

### Production Build

```bash
cd tee
npm run build          # Compiles to dist/
npm run start:prod     # Runs compiled output
```

### Deploy to Phala dstack

1. **Prepare your deployment configuration** for Phala dstack. The service is a standard NestJS application packaged as a Docker container with a PostgreSQL sidecar (using the provided `docker-compose.yml`).

2. **Set environment variables** in the dstack deployment configuration (see [Environment Variables Reference](#environment-variables-reference) below). In production, leave `DSTACK_ENDPOINT` empty -- the service auto-connects to `/var/run/dstack.sock` inside the TEE.

3. **Configure PostgreSQL.** The database runs locally inside the TEE container via Docker Compose. The `docker-compose.yml` in the `tee/` directory defines both the `postgres` and `tee` services. Data is persisted to a Docker volume (`pgdata`).

4. **Deploy the container** through Phala's dstack deployment interface.

### TEE Service Environment

```bash
# CKB Network
CKB_NETWORK=testnet
CKB_RPC_URL=https://testnet.ckb.dev/rpc
CKB_INDEXER_URL=https://testnet.ckb.dev/indexer

# TEE Signing Key (CKB private key for submitting transactions)
TEE_SIGNING_KEY=0x...

# Phala dstack (empty for production, simulator URL for local dev)
DSTACK_ENDPOINT=http://localhost:8090

# PostgreSQL (runs locally inside TEE container)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=haven
DATABASE_USER=haven
DATABASE_PASSWORD=haven_tee_secret

# OAuth credentials
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_CALLBACK_URL=http://localhost:3000/api/auth/twitter/callback

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# Proof Worker
PROOF_WORKER_URL=http://localhost:3001

# Haven Registry Cell
HAVEN_REGISTRY_TX_HASH=0x...
HAVEN_REGISTRY_INDEX=0

# Haven Type Script
HAVEN_TYPE_SCRIPT_CODE_HASH=0x1193537cffa570e905d47ce971a166720e07773f188bce6a1dafd2740e892a37
HAVEN_TYPE_SCRIPT_HASH_TYPE=type

# Scoring Schedule (every 24 hours in production, every 5 minutes for testing)
SCORING_CRON=*/5 * * * *

# Server
PORT=3000
```

---

## Proof Worker

The proof worker is a standalone Rust service that generates SP1 DCAP attestation proofs using Automata's `automata-dcap-zkvm`.

### Local Development

```bash
cd proof-worker
cp .env.example .env     # Edit with your SP1_PRIVATE_KEY
make setup               # Install SP1 toolchain
make run-debug           # Starts with debug logging on port 3001
```

Note: For local development with the dstack simulator, the proof worker receives hex-encoded TDX quotes from the TEE. It automatically strips the 4-byte simulator header when present.

### Production Build and Run

```bash
cd proof-worker
make build               # Builds release binary at target/release/proof-worker
make run                 # Runs the release binary with RUST_LOG=info
```

### Deploy as a Service

The proof worker is a stateless HTTP service. Deploy it as:

- A standalone binary on a Linux server
- A Docker container
- A cloud service (AWS ECS, GCP Cloud Run, etc.)

The proof worker has no privileged access -- it only generates proofs from DCAP attestations. It can be run by any party.

### Proof Worker Environment

```bash
# SP1 Network private key for remote proving
SP1_PRIVATE_KEY=...

# Proof system: "plonk" (default, used for CKB on-chain verification) or "groth16"
DCAP_PROOF_SYSTEM=plonk

# SP1 Network prover mode: "auction" (cheapest), "hosted", or "reserved"
DCAP_NETWORK_MODE=auction

# Ethereum RPC for fetching DCAP collaterals from Automata's on-chain PCCS
# Sepolia: PCCSRouter at 0x8e480c9879F1Db31dC209e5f4d239d5126e6e07B
# Mainnet: PCCSRouter at 0xE2Cd5aA44a0896D683684B8EA15eB54B269fC933
AUTOMATA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# Server port
PORT=3001

# TEE service URL (proof worker sends proofs back to TEE)
TEE_URL=http://localhost:3000
```

**SP1 proving modes:**
- `auction` -- Cheapest option, uses Succinct's auction-based prover network. Proof generation time varies.
- `hosted` -- Uses Succinct's hosted provers. Faster but more expensive.
- `reserved` -- Uses your reserved prover capacity. Predictable performance.

---

## Dashboard

The dashboard is a React + Vite + Tailwind CSS static site that can be deployed to any static hosting provider. It uses the "Sovereign" design system with sidebar navigation.

### Build

```bash
cd dashboard
npm install
npm run build    # Outputs to dist/
```

### Configuration

The dashboard reads configuration from `src/config.ts`. The following values should be updated for your deployment:

| Config Key | Description | Default |
|-----------|-------------|---------|
| `teeEndpoint` | TEE service URL | `http://localhost:3000/api` |
| `ckbNetwork` | CKB network | `testnet` |
| `ckbRpcUrl` | CKB RPC URL | `https://testnet.ckb.dev/rpc` |
| `havenTypeScriptCodeHash` | Deployed type script code hash | `0x1193537cffa...` |
| `havenTypeScriptHashType` | Type script hash type | `type` |
| `havenTypeScriptCellDepTxHash` | Cell dep TX hash for type script | `0xdec5fba84e...` |
| `havenTypeScriptCellDepIndex` | Cell dep index | `0` |
| `havenRegistryCellDepTxHash` | Registry cell dep TX hash | `0x31105ea4e1...` |
| `havenRegistryCellDepIndex` | Registry cell dep index | `0` |
| `twitterClientId` | Twitter OAuth client ID (for redirect URL construction) | -- |
| `githubClientId` | GitHub OAuth client ID (for redirect URL construction) | -- |

These can also be set via Vite environment variables (prefixed with `VITE_`):

```bash
VITE_TEE_ENDPOINT=https://your-tee.phala.network/api
VITE_CKB_NETWORK=testnet
VITE_CKB_RPC_URL=https://testnet.ckb.dev/rpc
VITE_HAVEN_TYPE_SCRIPT_CODE_HASH=0x...
```

### Deploy as Static Site

The `dist/` output is a static site. Deploy to:

- **Vercel:** Connect the repository and set the build command to `cd dashboard && npm install && npm run build` with output directory `dashboard/dist`
- **Cloudflare Pages:** Same approach
- **Netlify:** Same approach
- **Self-hosted:** Serve the `dist/` directory with any static file server (nginx, caddy, etc.)

### Preview

```bash
cd dashboard
npm run preview    # Preview the production build locally
```

### Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page |
| Dashboard | `/dashboard` | Score display, score history chart, action overlay |
| Identity | `/identity` | Wallet connection, OAuth flows, TEE health display |
| Leaderboard | `/leaderboard` | Public leaderboard sorted by score |
| Ecosystem | `/ecosystem` | Ecosystem integrations and partners |
| Settings | `/settings` | User settings |

---

## Environment Variables Reference

### TEE Service (`tee/.env`)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `CKB_NETWORK` | Yes | CKB network (`testnet` or `mainnet`) | `testnet` |
| `CKB_RPC_URL` | Yes | CKB RPC endpoint | `https://testnet.ckb.dev/rpc` |
| `CKB_INDEXER_URL` | Yes | CKB indexer endpoint | `https://testnet.ckb.dev/indexer` |
| `TEE_SIGNING_KEY` | Yes | CKB private key for transaction signing (hex) | -- |
| `DSTACK_ENDPOINT` | No | Phala dstack endpoint (empty for production TEE) | `http://localhost:8090` |
| `DATABASE_HOST` | Yes | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | Yes | PostgreSQL port | `5432` |
| `DATABASE_NAME` | Yes | PostgreSQL database name | `haven` |
| `DATABASE_USER` | Yes | PostgreSQL user | `haven` |
| `DATABASE_PASSWORD` | Yes | PostgreSQL password | `haven_tee_secret` |
| `TWITTER_CLIENT_ID` | Yes | Twitter OAuth 2.0 client ID | -- |
| `TWITTER_CLIENT_SECRET` | Yes | Twitter OAuth 2.0 client secret | -- |
| `TWITTER_CALLBACK_URL` | Yes | Twitter OAuth callback URL | `http://localhost:3000/api/auth/twitter/callback` |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth app client ID | -- |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth app client secret | -- |
| `GITHUB_CALLBACK_URL` | Yes | GitHub OAuth callback URL | `http://localhost:3000/api/auth/github/callback` |
| `PROOF_WORKER_URL` | Yes | URL of the proof worker service | `http://localhost:3001` |
| `HAVEN_REGISTRY_TX_HASH` | Yes | Transaction hash of the Registry cell | -- |
| `HAVEN_REGISTRY_INDEX` | Yes | Output index of the Registry cell | `0` |
| `HAVEN_TYPE_SCRIPT_CODE_HASH` | Yes | Deployed type script code hash (hex) | -- |
| `HAVEN_TYPE_SCRIPT_HASH_TYPE` | Yes | Type script hash type | `type` |
| `SCORING_CRON` | No | Cron expression for scoring cycle | `*/5 * * * *` |
| `PORT` | No | HTTP server port | `3000` |

### Proof Worker (`proof-worker/.env`)

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SP1_PRIVATE_KEY` | Yes | SP1 Network private key for remote proving | -- |
| `DCAP_PROOF_SYSTEM` | No | Proof system (`plonk` or `groth16`) | `plonk` |
| `DCAP_NETWORK_MODE` | No | SP1 prover mode (`auction`, `hosted`, `reserved`) | `auction` |
| `AUTOMATA_RPC_URL` | Yes | Ethereum RPC for DCAP collateral fetching | -- |
| `PORT` | No | HTTP server port | `3001` |
| `TEE_URL` | No | TEE service URL | `http://localhost:3000` |

### Deployment Checklist

- [ ] CKB scripts built and deployed to testnet (type-id for upgradability)
- [ ] Script code hashes recorded in `ckb/deployment/scripts.json`
- [ ] Registry cell created with initial configuration
- [ ] dstack simulator running for local development
- [ ] PostgreSQL running via Docker Compose (`docker compose up -d` in `tee/`)
- [ ] TEE service deployed to Phala dstack with all env vars set
- [ ] Proof worker deployed with SP1 key and Automata RPC configured
- [ ] Dashboard built with correct config (script code hashes, TEE endpoint, registry cell dep) and deployed to static hosting
- [ ] OAuth callback URLs updated to production domain
- [ ] TEE signing key funded with testnet CKBytes
- [ ] End-to-end test: connect wallet, link accounts, wait for scoring cycle, verify score on-chain, check notifications
