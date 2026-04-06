# Haven Protocol

**Public Score. Private Identity. Built on CKB.**

---

## What is Haven

Haven Protocol is a privacy reputation and incentivized discovery layer built natively on Nervos CKB. Users earn a public, non-transferable Haven Score (0-1000) based on real activity across Twitter, GitHub, and on-chain ecosystems. The score is fully visible -- it appears on public dashboards, leaderboards, and is readable by any dApp on CKB. What is never visible is the identity behind the score.

When users connect their accounts to Haven, those linkages are stored exclusively inside a Phala Network TEE (Trusted Execution Environment) in a PostgreSQL database running locally within the TEE container. Nobody outside the TEE -- not Haven contributors, not any database, not on-chain observers -- can ever know which Twitter account, GitHub profile, or set of wallets belongs to a given Haven Score. The TEE hardware protects the environment, and the data never leaves.

There is no traditional backend. The Phala TEE handles all computation, proof requests, and on-chain settlement. The SP1 proof worker is a separate stateless service that generates DCAP attestation proofs. The CKB type script is the final authority -- if the proof does not verify, the score does not update.

## Architecture

```
                          +------------------+
                          |   Haven Dashboard|
                          |  (React + Vite)  |
                          |  port 5173       |
                          +--------+---------+
                                   |
                          CCC Wallet Connect
                          + Score Reads (CKB)
                                   |
                     +-------------+-------------+
                     |                           |
               +-----v------+            +------v------+
               |  Haven SDK  |            | Phala TEE   |
               | (TypeScript)|            | (NestJS)    |
               +-----+------+            | port 3000   |
                     |                    +------+------+
              Read score cells                   |
              directly from CKB           1. Collect activity
                     |                    2. Run scoring (every 5 min)
                     |                    3. Request DCAP proof
                     |                    4. Create notifications
                     |                           |
                     |                    +------v------+
                     |                    | Proof Worker|
                     |                    | (Rust + SP1)|
                     |                    | port 3001   |
                     |                    +------+------+
                     |                           |
                     |                    Return SP1 proof
                     |                           |
                     |                    +------v------+
                     +-------------------->    CKB     |
                                          | (Score Cells|
                                          |  Type Script|
                                          |  Lock Script|
                                          +-------------+
```

**Data flow:** User connects wallet and accounts via Dashboard. OAuth tokens go directly to the Phala TEE. The TEE stores them in a local PostgreSQL database, collects activity, computes scores, sends DCAP attestation to the Proof Worker for SP1 proof generation, then constructs and submits CKB transactions. dApps read score cells directly from CKB via the SDK -- no Haven server involved. The TEE creates notifications on score changes, tier changes, and low deposit balance.

## Components

| Component | Description | Tech Stack | Port | Directory |
|-----------|-------------|------------|------|-----------|
| **CKB Scripts** | On-chain type script (SP1 proof verification, score rules, top-up check) and lock script (dual-path: TEE update + user control) | Rust, RISC-V, `no_std`, `ckb-std`, `sp1-verifier` | -- | `ckb/` |
| **TEE Service** | Phala TEE service that handles OAuth, scoring, DCAP attestation, notifications, health monitoring, and CKB transaction submission | NestJS, TypeScript, TypeORM, PostgreSQL, `@phala/dstack-sdk`, CCC | 3000 | `tee/` |
| **Proof Worker** | Stateless SP1 proof generator for DCAP attestations using Automata's zkVM verifier | Rust, Axum, `automata-dcap-zkvm` v1.1.1-alpha-3, SP1, Alloy | 3001 | `proof-worker/` |
| **SDK** | TypeScript SDK for reading and verifying Haven Scores from CKB. Includes React hooks and TEE client | TypeScript, CCC (`@ckb-ccc/core`), React (optional) | -- | `sdk/` |
| **Dashboard** | Web frontend for connecting accounts, viewing scores, leaderboard, notifications, and managing deposits | React, Vite, Tailwind CSS, CCC connector | 5173 | `dashboard/` |

## Quick Start

### Prerequisites

- **Rust** (stable + nightly): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **RISC-V target**: `rustup target add riscv64imac-unknown-none-elf`
- **SP1 toolchain**: `curl -L https://sp1up.dev | bash && ~/.sp1/bin/sp1up`
- **Node.js** >= 18: [https://nodejs.org](https://nodejs.org)
- **Docker** and **Docker Compose**: for running PostgreSQL locally
- **CKB CLI** (optional, for deployment): [https://github.com/nervosnetwork/ckb-cli](https://github.com/nervosnetwork/ckb-cli)

### Clone and Install

```bash
git clone <repository-url>
cd haven
```

### 1. Build CKB Scripts

```bash
cd ckb
make prepare    # Installs RISC-V target
make build      # Builds type script + lock script to build/release/
```

### 2. Start PostgreSQL (for TEE Service)

```bash
cd tee
docker compose up -d    # Starts PostgreSQL on port 5432
```

### 3. Set Up dstack Simulator (for local development)

For local development without a real Phala TEE, run the dstack simulator:

```bash
git clone https://github.com/Dstack-TEE/dstack.git
cd dstack/sdk/simulator
./build.sh
./dstack-simulator    # Starts on http://localhost:8090
```

Then set `DSTACK_ENDPOINT=http://localhost:8090` in `tee/.env`.

### 4. Start TEE Service

```bash
cd tee
cp .env.example .env     # Edit with credentials (see Environment Variables)
npm install
npm run start:dev        # Starts on port 3000
```

### 5. Start Proof Worker

```bash
cd proof-worker
cp .env.example .env     # Edit with your SP1_PRIVATE_KEY and AUTOMATA_RPC_URL
make setup               # Install SP1 toolchain (if not already done)
cargo run                # Starts on port 3001
```

### 6. Start Dashboard

```bash
cd dashboard
npm install
npm run dev              # Starts Vite dev server on port 5173
```

## Project Structure

```
haven/
├── ckb/                           # CKB on-chain Rust scripts
│   ├── contracts/
│   │   ├── haven-type-script/     # Score update verification (SP1 proof, rules, top-up check)
│   │   └── haven-lock-script/     # Dual-path lock (TEE update + user control)
│   ├── haven-types/               # Shared types: ScoreCell, RegistryCell, PublicInputs
│   ├── tests/                     # On-chain script integration tests
│   ├── deployment/
│   │   └── scripts.json           # Deployed script code hashes and cell deps
│   └── Makefile                   # Build commands (prepare, build, test)
├── tee/                           # Phala TEE NestJS service
│   ├── docker-compose.yml         # PostgreSQL setup (runs locally inside TEE)
│   ├── .env.example               # All environment variables
│   └── src/
│       ├── attestation/           # DCAP attestation + proof worker client
│       ├── auth/                  # OAuth strategies (Twitter, GitHub) + guards
│       ├── chain/                 # CKB transaction building + registry reads
│       ├── config/                # Environment configuration
│       ├── health/                # Health/status endpoint (GET /api/health)
│       ├── identity/              # CKB wallet identity verification
│       ├── notifications/         # Notification entity, service, controller
│       ├── scoring/               # Score computation
│       │   ├── collectors/        # twitter, github, onchain collectors
│       │   ├── formulas/          # privacy-hygiene, contribution, humanity, community
│       │   ├── scoring.service.ts # Core scoring engine
│       │   └── scoring.scheduler.ts # Cron-based scoring cycle
│       └── storage/               # PostgreSQL entities and database service
│           └── entities/          # user.entity.ts, connection.entity.ts
├── proof-worker/                  # Rust SP1 proof worker
│   ├── .env.example               # Proof worker environment variables
│   └── src/
│       ├── main.rs                # Axum HTTP server entry point
│       ├── prover.rs              # Automata DCAP SP1 proof generation
│       ├── routes.rs              # HTTP endpoints
│       └── types.rs               # Request/response types
├── sdk/                           # TypeScript SDK (@haven-protocol/ckb-sdk)
│   └── src/
│       ├── client.ts              # HavenClient (core API: getScore, verifyThreshold, etc.)
│       ├── cell-parser.ts         # 127-byte score cell parser/serializer
│       ├── tee/                   # HavenTeeClient (OAuth, identity, health, notifications)
│       │   ├── client.ts          # TEE HTTP client
│       │   └── types.ts           # TEE types (ConnectionStatus, TeeHealthStatus, HavenNotification)
│       ├── react/                 # React hooks
│       │   ├── provider.ts        # HavenProvider context
│       │   ├── useHavenScore.ts   # Score fetching hook
│       │   ├── useHavenGate.ts    # Threshold gating hook
│       │   ├── useLeaderboard.ts  # Leaderboard hook
│       │   ├── useAuth.ts         # Auth state hook
│       │   ├── useDeposit.ts      # Deposit management hook
│       │   └── useNotifications.ts # Notification polling hook (30s interval)
│       ├── contracts/             # Script builders and deploy info
│       ├── constants.ts           # Tier thresholds, cell offsets, code hashes
│       ├── types.ts               # TypeScript type definitions
│       ├── wallet.ts              # Wallet helpers (identity message, deposit top-up)
│       └── deposits.ts            # Deposit balance utilities
├── dashboard/                     # React frontend (Vite + Tailwind)
│   ├── vite.config.ts             # Vite config (port 5173)
│   └── src/
│       ├── config.ts              # Dashboard configuration (TEE endpoint, script hashes)
│       ├── components/            # UI components (auth, deposit, leaderboard, score, wallet)
│       ├── hooks/                 # React hooks (useAuth, useDeposit, useHavenScore, etc.)
│       └── pages/                 # Dashboard, Identity, Leaderboard, Ecosystem, Home, Settings
├── docs/                          # Protocol documentation
│   ├── architecture.md            # Technical architecture
│   └── deployment.md              # Deployment guide
└── SPEC.md                        # Full protocol specification
```

## Key Concepts

### Haven Score

A public, non-transferable reputation score from 0 to 1000, stored on-chain in a CKB cell. Composed of four weighted components:

| Component | Weight | Max Score | Signals |
|-----------|--------|-----------|---------|
| Privacy Hygiene | 40% | 400 | Address rotation, transaction diversity, total transactions, account age |
| Ecosystem Contribution | 30% | 300 | GitHub commits, governance participation, on-chain activity |
| Proof of Human | 20% | 200 | Sybil resistance, account age, cross-platform consistency |
| Community Engagement | 10% | 100 | Platform participation, on-chain activity patterns |

Scores are rebalanced for CKB-only scoring -- users without social accounts connected still receive meaningful scores from on-chain activity.

### Score Tiers

| Tier | Score Range | Access Level |
|------|-------------|--------------|
| Observer | 0-199 | Dashboard access, basic features |
| Initiate | 200-399 | Funding pools, basic Haven Passes |
| Trusted | 400-649 | Shadow Job Board, whitelists, private channels |
| Guardian | 650-849 | Governance voting, confidential AMAs, multiplier bonuses |
| Sovereign | 850-1000 | Full access, exclusive funding pools |

### Score Cells

Each user has exactly one Haven Score cell on CKB (127 bytes). The cell stores the score, epoch, identity commitment, program hash, proof hash, breakdown, timestamps, and deposit balance. All fields are public and readable by anyone.

### Dual-Path Lock Script

The score cell uses a custom lock script with two unlock paths:
- **Path 1 (TEE Update, 0x00):** The Phala TEE can update the score, but only with a valid SP1 proof. It cannot drain the deposit or change the identity. The lock script verifies the TEE signature and ensures a type script is present on the output cell.
- **Path 2 (User Direct, 0x01):** The user can always unlock with their private key to top up deposits, migrate cells, or reclaim CKBytes. The type script allows deposit top-ups without requiring an SP1 proof.

### Top-Up Without Proof

The Haven type script includes an `is_topup_only` check. When the only change to a score cell is an increase in `deposit_balance` (all other fields identical), the transaction is allowed without an SP1 proof. This lets users top up their deposit directly via their wallet.

### TEE Attestation

All account linkages and scoring happen inside the Phala TEE. A DCAP attestation proves the computation ran in a genuine TEE. The SP1 proof worker then generates a proof over this attestation, which the CKB type script verifies on-chain.

### Notifications

The TEE creates notifications on score changes, tier changes, and low deposit balance. The dashboard polls notifications via the SDK's `useNotifications` hook with a 30-second interval. Notification types: `score_update`, `tier_change`, `deposit_low`, `epoch_complete`, `system`.

### Health Monitoring

`GET /api/health` returns TEE health status including `teeHealth` (online/degraded/offline), `enclaveId`, `lastAttestation`, `protocolVersion`, and `uptime`. The dashboard footer and identity page display this data.

## Environment Variables

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
| `TEE_URL` | No | TEE service URL (proof worker sends proofs back) | `http://localhost:3000` |

## Development

### CKB Scripts

```bash
cd ckb
make build              # Build all contracts
make test               # Run integration tests
make check              # cargo check
make clippy             # cargo clippy
make fmt                # cargo fmt
```

Build a single contract:
```bash
make build CONTRACT=haven-type-script
```

### TEE Service

```bash
cd tee
docker compose up -d    # Start PostgreSQL
npm install
npm run start:dev       # Development mode with hot reload
npm run start:debug     # Debug mode
npm run build           # Production build
npm run lint            # Lint with ESLint
```

### Proof Worker

```bash
cd proof-worker
make build              # Build release binary
make run                # Run the proof worker
make run-debug          # Run with debug logging
make check              # cargo check
make lint               # cargo clippy
```

### SDK

```bash
cd sdk
npm install
npm run build           # Build TypeScript to dist/
npm run dev             # Watch mode
npm run typecheck       # Type checking without emit
```

### Dashboard

```bash
cd dashboard
npm install
npm run dev             # Vite dev server with HMR on port 5173
npm run build           # Production build (tsc + vite build)
npm run preview         # Preview production build
```

## Testing

```bash
# CKB on-chain scripts
cd ckb && cargo test

# TEE service
cd tee && npm test

# Proof worker
cd proof-worker && cargo test

# SDK type checking
cd sdk && npm run typecheck
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for the full deployment guide. High-level overview:

1. **CKB Scripts** -- Build RISC-V binaries and deploy to CKB testnet (Pudge) using `ckb-cli` or `offckb`
2. **Registry Cell** -- Create the global Haven Registry cell with initial program hash and configuration
3. **TEE Service** -- Deploy to Phala dstack (managed TEE infrastructure) with PostgreSQL co-located in the container
4. **Proof Worker** -- Deploy as a standalone Rust service with SP1 Network access
5. **Dashboard** -- Build and deploy as a static site (Vercel, Cloudflare Pages, etc.)

### Deployed Script Hashes (Testnet)

| Script | Code Hash | Hash Type |
|--------|-----------|-----------|
| haven-type-script | `0x1193537cffa570e905d47ce971a166720e07773f188bce6a1dafd2740e892a37` | `type` |

Cell dep for haven-type-script: `0xdec5fba84ef56bcb3ee9f2db791183a7bfe8187dd462e8919a35348d4970448c` index `0`.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and ensure tests pass
4. Submit a pull request with a clear description

Please follow existing code conventions:
- Rust: `cargo fmt` + `cargo clippy`
- TypeScript: follow existing ESLint configuration
- Commits: concise, descriptive messages

## License

MIT
