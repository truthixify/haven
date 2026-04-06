# Haven TEE Service

NestJS application running inside a Phala Network Intel TDX enclave. This is the backend for Haven Protocol -- it handles account linking, score computation, DCAP attestation, and CKB transaction submission. All sensitive data (OAuth tokens, account linkages, raw activity data) stays inside the TEE enclave.

## Tech Stack

- **Runtime:** NestJS 10, TypeORM, PostgreSQL 16
- **TEE:** @phala/dstack-sdk for DCAP attestation and sealed storage
- **Chain:** @ckb-ccc/core for CKB transaction building
- **Auth:** Passport (passport-twitter, passport-github2)
- **Scheduling:** @nestjs/schedule (cron-based scoring cycles)

## Modules

| Module | Purpose |
|--------|---------|
| **Identity** | CKB wallet verification, Blake2b identity commitment generation |
| **Auth** | Twitter OAuth 2.0, GitHub OAuth, connection status |
| **Scoring** | Collectors (Twitter, GitHub, on-chain CKB), formulas (privacy-hygiene, contribution, humanity, community), scheduler |
| **Attestation** | DCAP attestation generation via dstack, SP1 proof worker client |
| **Chain** | CKB transaction building, cell serialization, registry reads |
| **Notifications** | User notification management (score updates, connection events) |
| **Health** | Service health/status endpoint |
| **Storage** | TypeORM entities (users, connections, notifications) |

## Database

PostgreSQL running locally inside the TEE container. Tables:

- **users** -- registered identities with identity commitments
- **connections** -- modular provider connections (any provider, no hardcoded columns per platform)
- **notifications** -- user notifications

Schema is auto-synchronized via TypeORM (`synchronize: true`).

## Scoring

- Runs on a configurable cron schedule (default: every 5 minutes, `SCORING_CRON=*/5 * * * *`)
- **Collectors:** Twitter, GitHub, on-chain CKB (supports any CKB lock script type)
- **Formulas:** Privacy Hygiene, Contribution, Humanity, Community -- four component scores that sum to the total (0-1000)
- Each cycle collects activity, computes scores, generates attestation, requests SP1 proof, and submits CKB transactions

## API Endpoints

All routes are prefixed with `/api`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/identity/verify` | Register identity (CKB signature verification) |
| POST | `/api/identity/commitment` | Compute identity commitment without registering |
| GET | `/api/identity/check` | Check if an identity commitment is registered |
| GET | `/api/auth/twitter` | Start Twitter OAuth flow |
| POST | `/api/auth/twitter/callback` | Complete Twitter OAuth |
| GET | `/api/auth/github` | Start GitHub OAuth flow |
| POST | `/api/auth/github/callback` | Complete GitHub OAuth |
| GET | `/api/auth/status` | Check connection status for an identity |
| POST | `/api/score/refresh` | Request manual score refresh |
| GET | `/api/notifications` | Get notifications for an identity |
| GET | `/api/notifications/unread-count` | Get unread notification count |
| POST | `/api/notifications/:id/read` | Mark notification as read |
| POST | `/api/notifications/read-all` | Mark all notifications as read |
| GET | `/api/health` | Health check |

## Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL 16
- Phala dstack simulator (for local development)

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|----------|-------------|---------|
| `CKB_NETWORK` | CKB network (testnet/mainnet) | `testnet` |
| `CKB_RPC_URL` | CKB node RPC URL | `https://testnet.ckb.dev/rpc` |
| `CKB_INDEXER_URL` | CKB indexer URL | `https://testnet.ckb.dev/indexer` |
| `TEE_SIGNING_KEY` | CKB private key for TEE transaction signing | -- |
| `DSTACK_ENDPOINT` | Phala dstack endpoint (leave empty in production) | `http://localhost:8090` |
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | Database name | `haven` |
| `DATABASE_USER` | Database user | `haven` |
| `DATABASE_PASSWORD` | Database password | `haven_tee_secret` |
| `TWITTER_CLIENT_ID` | Twitter OAuth 2.0 client ID | -- |
| `TWITTER_CLIENT_SECRET` | Twitter OAuth 2.0 client secret | -- |
| `TWITTER_CALLBACK_URL` | Twitter OAuth callback URL | `http://localhost:3000/api/auth/twitter/callback` |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | -- |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | -- |
| `GITHUB_CALLBACK_URL` | GitHub OAuth callback URL | `http://localhost:3000/api/auth/github/callback` |
| `PROOF_WORKER_URL` | SP1 proof worker URL | `http://localhost:3001` |
| `HAVEN_TYPE_SCRIPT_CODE_HASH` | Deployed type script code hash | -- |
| `HAVEN_REGISTRY_TX_HASH` | Registry cell outpoint tx hash | -- |
| `SCORING_CRON` | Scoring cycle cron expression | `*/5 * * * *` |
| `PORT` | HTTP server port | `3000` |

### Run

Start PostgreSQL:

```bash
docker-compose up -d postgres
```

For local development, start the Phala dstack simulator:

```bash
git clone https://github.com/Dstack-TEE/dstack.git
cd dstack/sdk/simulator
./build.sh
./dstack-simulator
```

Start the TEE service:

```bash
npm install
npx nest start
```

Or in watch mode:

```bash
npx nest start --watch
```

The service runs on port **3000** by default.
