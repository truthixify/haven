# Haven Protocol -- Technical Architecture

This document describes the technical architecture of Haven Protocol, covering how the five components interact, data flows, on-chain cell layouts, and the security model.

For the full protocol specification, see [SPEC.md](../SPEC.md).

---

## Table of Contents

- [System Overview](#system-overview)
- [Component Interactions](#component-interactions)
- [Data Flow](#data-flow)
- [Score Update Pipeline](#score-update-pipeline)
- [Storage Model](#storage-model)
- [Cell Model](#cell-model)
- [Witness Layout](#witness-layout)
- [Lock Script Paths](#lock-script-paths)
- [Notification System](#notification-system)
- [Health Monitoring](#health-monitoring)
- [Security Model](#security-model)
- [SDK Architecture](#sdk-architecture)

---

## System Overview

Haven Protocol consists of five components with no traditional backend server:

```
+-------------------+       +-------------------+       +-------------------+
|    Dashboard      |       |    Haven SDK      |       |   Third-Party     |
|  (React + Vite)   |       |   (TypeScript)    |       |      dApps        |
|  port 5173        |       |                   |       |                   |
+--------+----------+       +--------+----------+       +--------+----------+
         |                           |                           |
         | CCC Wallet Connect        | Read score cells          | Read score cells
         | OAuth redirects           | Verify thresholds         | Gate features
         | Notification polling      |                           |
         |                           |                           |
+--------v-----------+               |                           |
|    Phala TEE       |               |                           |
|    (NestJS)        |               |                           |
|    port 3000       |               |                           |
|    + PostgreSQL    |               |                           |
|    port 5432       |               |                           |
+--------+-----------+               |                           |
         |                           |                           |
         | DCAP attestation          |                           |
         |                           |                           |
+--------v-----------+               |                           |
|   Proof Worker     |               |                           |
|   (Rust + SP1)     |               |                           |
|   port 3001        |               |                           |
+--------+-----------+               |                           |
         |                           |                           |
         | SP1 proof                 |                           |
         |                           |                           |
+--------v-----------+---------------v---------------------------v----------+
|                              CKB Blockchain                              |
|                                                                          |
|   +----------------+    +------------------+    +-------------------+    |
|   | Score Cells    |    | Registry Cell    |    | Haven Lock Script |    |
|   | (127 bytes ea) |    | (global config)  |    | (dual-path)       |    |
|   +----------------+    +------------------+    +-------------------+    |
|                                                                          |
|   +------------------+    +-------------------+                          |
|   | Haven Type Script|    | haven-types       |                          |
|   | (proof verifier) |    | (shared Rust lib) |                          |
|   +------------------+    +-------------------+                          |
+--------------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Role | Stateful? |
|-----------|------|-----------|
| **Dashboard** | User interface for wallet connect, OAuth flows, score display, leaderboard, notifications, deposit management | No (reads CKB directly, polls TEE for notifications) |
| **TEE Service** | Collects activity via APIs, runs scoring program, generates DCAP attestation, submits CKB transactions, manages notifications | Yes (PostgreSQL: users, connections, notifications) |
| **Proof Worker** | Receives DCAP attestation, generates SP1 proof, returns proof to TEE | No (stateless) |
| **SDK** | TypeScript library for reading/verifying scores from CKB. React hooks for frontend integration. TEE client for identity and notifications | No (pure on-chain reads + TEE API calls) |
| **CKB Scripts** | Type script verifies SP1 proofs, enforces score update rules, allows proof-free top-ups. Lock script enforces dual-path access | N/A (on-chain) |

---

## Component Interactions

### Dashboard <-> TEE Service

The dashboard communicates directly with the Phala TEE for identity-sensitive operations:

1. **Identity Registration:** User signs an identity message via CCC wallet connect. The dashboard sends the public key, signature, and message to the TEE's `/api/identity/verify` endpoint. The TEE generates a Blake2b identity commitment and stores the user record in PostgreSQL.

2. **Identity Check:** The dashboard can check if an identity is already registered via `/api/identity/check?commitment=...`.

3. **OAuth Flows:** Twitter and GitHub OAuth redirects go through the TEE's auth endpoints. OAuth tokens are passed directly to the TEE and stored in the `connections` table in PostgreSQL -- they never touch any intermediate storage.

4. **Score Refresh:** The dashboard can request a manual score refresh via the TEE's `/api/score/refresh` endpoint.

5. **Notifications:** The dashboard polls the TEE's `/api/notifications` endpoints via the SDK's `useNotifications` hook (30-second interval for unread count, full list on demand).

6. **Health Status:** The dashboard fetches TEE health from `/api/health` and displays it in the footer and identity page.

### Dashboard <-> CKB (via SDK)

All score reads are pure on-chain queries through CCC:

- Score display: `HavenClient.getScore(lockHash)`
- Leaderboard: `HavenClient.getLeaderboard(limit)`
- Deposit top-up: User signs a CKB transaction via CCC

### TEE Service <-> Proof Worker

The TEE calls the proof worker over HTTP after computing a score:

1. TEE sends a DCAP attestation payload (hex-encoded TDX quote) to `POST /prove`
2. Proof worker strips the 4-byte simulator header if present (detected by TDX version check)
3. Proof worker fetches DCAP collaterals from Automata's on-chain PCCS via Ethereum RPC
4. Proof worker generates an SP1 PLONK proof using Automata's `automata-dcap-zkvm`
5. Proof worker returns the SP1 proof bytes, public values, proof hash, program ID, and verification key hash
6. TEE includes the proof in a CKB transaction witness

### TEE Service <-> CKB

The TEE uses CCC server-side (`@ckb-ccc/core`) to:

- Read existing score cells to get current state
- Read the Registry cell for program hash and configuration
- Build score update transactions with the SP1 proof in the witness
- Sign and submit transactions using a TEE signing key

### SDK <-> CKB

The SDK uses CCC to find and parse score cells:

- `findCellsByType(havenTypeScript)` to locate score cells
- Parses the 127-byte cell data into typed `HavenScore` objects
- Checks expiry against the current tip block number

---

## Data Flow

### First-Time User Setup

```
User          Dashboard         TEE Service          CKB
 |                |                  |                 |
 |-- Connect ---->|                  |                 |
 |   Wallet       |                  |                 |
 |                |-- Sign message ->|                 |
 |                |   (CCC)          |                 |
 |                |                  |                 |
 |                |-- POST /api/identity/verify ------>|
 |                |   {pubKey, sig, message,           |
 |                |    lockCodeHash, lockHashType,     |
 |                |    lockArgs}                       |
 |                |                  |                 |
 |                |<-- identityCommitment -------------|
 |                |                  |-- Store user    |
 |                |                  |   in PostgreSQL  |
 |                |                  |                 |
 |-- Connect ---->|-- OAuth redirect>|                 |
 |   Twitter      |                  |-- Store         |
 |                |                  |   connection    |
 |                |                  |   in PostgreSQL  |
 |-- Connect ---->|-- OAuth redirect>|                 |
 |   GitHub       |                  |-- Store         |
 |                |                  |   connection    |
 |                |                  |   in PostgreSQL  |
 |                |                  |                 |
 |-- Deposit ---->|-- CKB tx ------->|---------------->|
 |   CKBytes      |  (via CCC)      |                 |
 |                |                  |       Creates initial
 |                |                  |       score cell (score=0)
```

### Score Update Cycle (Every 5 Minutes)

```
TEE Service               Proof Worker                CKB
    |                          |                        |
    |-- Read PostgreSQL ------>|                        |
    |   (users, connections)   |                        |
    |                          |                        |
    |-- Call Twitter API ----->|                        |
    |-- Call GitHub API ------>|                        |
    |-- Query CKB indexer ---->|                        |
    |   (supports any lock     |                        |
    |    script type)          |                        |
    |                          |                        |
    |-- Run scoring formulas ->|                        |
    |   (4 formulas in         |                        |
    |    parallel)             |                        |
    |                          |                        |
    |-- Generate DCAP -------->|                        |
    |   attestation            |                        |
    |                          |                        |
    |-- POST /prove ---------->|                        |
    |   {hex-encoded TDX quote}|                        |
    |                          |                        |
    |<-- SP1 proof + vk_hash --|                        |
    |                          |                        |
    |-- Build CKB tx (CCC) --->|                        |
    |   input: old score cell  |                        |
    |   output: new score cell |                        |
    |   witness: SP1 proof     |                        |
    |                          |                        |
    |-- Submit tx ------------>|----------------------->|
    |                          |                        |
    |                          |        Type script verifies:
    |                          |        - SP1 proof valid
    |                          |        - Program hash matches registry
    |                          |        - Identity unchanged
    |                          |        - Epoch incremented
    |                          |        - Fee deducted correctly
    |                          |        - Breakdown sums to total
    |                          |                        |
    |                          |        Lock script verifies:
    |                          |        - TEE path (0x00)
    |                          |        - TEE signature valid
    |                          |        - Type script present on output
    |                          |                        |
    |-- Create notifications ->|                        |
    |   (score update,         |                        |
    |    tier change,          |                        |
    |    low balance)          |                        |
    |                          |                        |
    |-- Update PostgreSQL ---->|                        |
    |   (lastScoredEpoch,      |                        |
    |    lastComputedScore)    |                        |
```

### dApp Score Verification (No Haven Involvement)

```
User          Third-Party dApp        CKB
 |                 |                    |
 |-- Visit dApp ->|                    |
 |                 |                    |
 |                 |-- getScore(lockHash) -->|
 |                 |   (via Haven SDK + CCC)|
 |                 |                    |
 |                 |<-- HavenScore ----------|
 |                 |    {score, tier,        |
 |                 |     isValid, ...}       |
 |                 |                    |
 |                 |-- Check threshold  |
 |                 |   score >= 650?    |
 |                 |                    |
 |<-- Access ------| (granted or denied)|
```

---

## Score Update Pipeline

Step-by-step detail of a single score update:

1. **TEE Scoring Trigger:** The NestJS `@Cron` scheduler (`scoring.scheduler.ts`) fires every 5 minutes (configurable via `SCORING_CRON`, default `*/5 * * * *`). If a cycle is already running, the trigger is skipped.

2. **Epoch Initialization:** On first run after TEE restart, the epoch is initialized from the database by reading the maximum `lastScoredEpoch` across all users. The epoch then increments for each cycle.

3. **User Processing:** Users are processed in batches of 10 to avoid overwhelming external APIs. Each user goes through the full pipeline. Failed users are logged and retried next cycle.

4. **Activity Collection:** The scoring service reads the PostgreSQL database to retrieve connection tokens for each user. It calls three collectors in parallel:
   - `twitter.collector.ts` -- Twitter API for privacy-related activity (only if Twitter is connected)
   - `github.collector.ts` -- GitHub API for contribution history (only if GitHub is connected)
   - `onchain.collector.ts` -- CKB indexer for on-chain activity (always collected; supports any lock script type including secp256k1, omnilock, JoyID)

5. **Score Computation:** The scoring service (`scoring.service.ts`) runs four formulas over the collected activity:
   - `privacy-hygiene.ts` -- Address rotation (40%), transaction diversity (30%), total transactions (20%), account age (10%). Uses sigmoid normalization. Max 400.
   - `contribution.ts` -- GitHub commits, governance participation. Max 300.
   - `humanity.ts` -- Sybil resistance signals, account age, cross-platform consistency. Max 200.
   - `community.ts` -- Platform participation. Max 100.

6. **DCAP Attestation:** The attestation service (`attestation.service.ts`) generates a Phala DCAP attestation over the scoring output using `@phala/dstack-sdk`. This step is skipped if the proof worker is unavailable.

7. **SP1 Proof Generation:** The proof worker client (`proof-worker.client.ts`) sends the DCAP attestation (hex-encoded TDX quote) to the proof worker's `/prove` endpoint. The proof worker uses Automata's `automata-dcap-zkvm` to generate an SP1 PLONK proof. This step is skipped if the proof worker is unavailable.

8. **Transaction Construction:** The chain service (`chain.service.ts`) builds a CKB transaction using CCC:
   - Input: the user's current score cell
   - Output: a new score cell with updated score, epoch, timestamps, and decremented deposit balance
   - Witness: path flag (0x00) + public inputs (84 bytes) + vk hash (32 bytes) + proof length (4 bytes) + SP1 proof (variable)
   - Cell dep: Haven Registry cell (for program hash verification)
   This step is skipped if no proof was generated or no score cell outpoint exists.

9. **CKB Verification:** When the transaction reaches CKB:
   - The **lock script** checks the witness path flag (0x00 = TEE path), verifies the TEE secp256k1 signature, and confirms the type script is present on the output
   - The **type script** deserializes the witness, extracts public inputs, verifies the SP1 proof against the verification key, checks the program hash against the Registry cell (current or previous), and validates all state transition rules

10. **Settlement:** If verification passes, the old score cell is consumed and the new score cell is created. The score is now live on-chain.

11. **Notifications:** The TEE creates notifications for the user: score update (if score changed), tier change (if tier changed), and low balance (if deposit is below threshold). Notification failures never break the scoring pipeline.

12. **Database Update:** The TEE updates the user's `lastScoredEpoch` and `lastComputedScore` in PostgreSQL.

---

## Storage Model

The TEE uses PostgreSQL (via TypeORM) running locally inside the TEE container. Docker Compose co-locates the database with the TEE service.

### Database Tables

**users** -- Primary key: `identityCommitment`

| Column | Type | Description |
|--------|------|-------------|
| `identityCommitment` | varchar (PK) | Blake2b hash of CKB public key |
| `ckbPubKey` | varchar | User's CKB public key or address |
| `lockCodeHash` | varchar (nullable) | Lock script code hash (any type) |
| `lockHashType` | varchar (nullable) | Lock script hash type |
| `lockArgs` | varchar (nullable) | Lock script args |
| `lastScoredEpoch` | int (nullable) | Last epoch this user was scored |
| `lastComputedScore` | int (nullable) | Most recently computed score |
| `scoreCellOutpoint` | jsonb (nullable) | `{ txHash, index }` of on-chain score cell |
| `createdAt` | timestamp | Auto-generated |
| `updatedAt` | timestamp | Auto-generated |

**connections** -- Modular provider connections (unique constraint: `identityCommitment + provider`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `identityCommitment` | varchar (indexed) | FK to users table |
| `provider` | varchar | `twitter`, `github`, `linkedin`, `discord`, `telegram`, etc. |
| `providerId` | varchar | User's ID on that platform |
| `accessToken` | varchar (nullable) | OAuth access token |
| `refreshToken` | varchar (nullable) | OAuth refresh token |
| `metadata` | jsonb (nullable) | Provider-specific data (username, avatar, etc.) |
| `reputationWeight` | decimal(5,2) | How much this provider contributes to score (0-100) |
| `connectedAt` | timestamp | Auto-generated |
| `updatedAt` | timestamp | Auto-generated |

**notifications** -- User notification queue

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `identityCommitment` | varchar (indexed) | User identity |
| `type` | varchar | `score_update`, `tier_change`, `deposit_low`, `epoch_complete`, `system` |
| `title` | varchar | Notification title |
| `message` | text | Notification body |
| `read` | boolean | Default false |
| `metadata` | jsonb (nullable) | Structured data |
| `createdAt` | timestamp | Auto-generated |

### Why PostgreSQL Instead of Sealed Storage

The TEE hardware protects the entire execution environment, making application-level encryption unnecessary. PostgreSQL provides a standard relational database with proper indexing, querying, and transaction support. The modular connections table design makes it easy to add new providers without schema changes -- just insert a new row with the appropriate `provider` value.

Docker Compose runs PostgreSQL as a sidecar container alongside the TEE service:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: haven
      POSTGRES_USER: haven
      POSTGRES_PASSWORD: haven_tee_secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  tee:
    build: .
    depends_on:
      - postgres
    environment:
      DATABASE_HOST: postgres
    ports:
      - "3000:3000"
```

---

## Cell Model

### Haven Score Cell (127 bytes)

Each user has exactly one score cell. All fields are public and readable by anyone.

```
Offset  Size  Field             Type    Description
------  ----  ----------------  ------  ----------------------------------------
0       1     version           u8      Cell schema version (currently 1)
1       2     score             u16 LE  Haven Score, 0-1000
3       4     epoch             u32 LE  Score epoch number, increments each update
7       32    user_identity     [u8]    Blake2b hash of CKB public key
39      32    program_hash      [u8]    Hash of SP1 scoring program used
71      32    proof_hash        [u8]    Blake2b hash of the SP1 proof
103     2     privacy_score     u16 LE  Privacy Hygiene component (0-400)
105     2     contribution_score u16 LE Ecosystem Contribution component (0-300)
107     2     humanity_score    u16 LE  Proof of Human component (0-200)
109     2     community_score   u16 LE  Community Engagement component (0-100)
111     4     issued_at         u32 LE  CKB block number of last update
115     4     expires_at        u32 LE  Block number after which score is stale
119     8     deposit_balance   u64 LE  Remaining CKBytes for update fees (shannons)
------  ----
Total: 127 bytes
```

**Validation rules enforced by the type script:**
- `version` must equal `CURRENT_VERSION` (1)
- `score` must be 0-1000
- `privacy_score + contribution_score + humanity_score + community_score == score`
- `epoch` must increment by exactly 1 from the input cell
- `user_identity` must be identical between input and output cells
- `deposit_balance` must decrease by exactly the per-update fee
- `program_hash` must match the current or previous hash in the Registry cell
- `expires_at` must equal `issued_at + epoch_duration`

**Top-up exception:** When only `deposit_balance` increases and all other fields are identical, the type script allows the transaction without an SP1 proof. This enables users to top up deposits directly.

### Haven Registry Cell

A single global cell controlled by the Haven Protocol multisig. Contains protocol configuration.

```
Offset  Size  Field                Type    Description
------  ----  -------------------  ------  ----------------------------------------
0       32    program_hash         [u8]    Current valid SP1 scoring program hash
32      32    prev_program_hash    [u8]    Previous hash (grace period transitions)
64      4     epoch_duration       u32 LE  Score expiry window in CKB blocks
68      8     min_deposit          u64 LE  Minimum deposit to create a score cell
76      8     per_update_fee       u64 LE  Fee deducted per score update (shannons)
84      32    fee_address          [u8]    Protocol fee recipient lock hash
116     2     tier_observer        u16 LE  Observer tier threshold (0)
118     2     tier_initiate        u16 LE  Initiate tier threshold (200)
120     2     tier_trusted         u16 LE  Trusted tier threshold (400)
122     2     tier_guardian        u16 LE  Guardian tier threshold (650)
124     2     tier_sovereign       u16 LE  Sovereign tier threshold (850)
126     1     version              u8      Registry schema version
127     4     grace_epochs         u32 LE  Epochs to accept previous program hash
131     8     low_balance_threshold u64 LE Low-balance warning threshold (shannons)
------  ----
Total: 139 bytes
```

### Lock Script Args

The Haven lock script args encode two 20-byte public key hashes:

```
Offset  Size  Field             Description
------  ----  ----------------  ----------------------------------------
0       20    user_pubkey_hash  Blake2b-160 of user's CKB public key
20      20    tee_pubkey_hash   Blake2b-160 of TEE's CKB signing key
------  ----
Total: 40 bytes
```

---

## Witness Layout

### TEE Update Path (path flag = 0x00)

Used when the Phala TEE submits a score update transaction. The witness is stored in the `input_type` field of `WitnessArgs` (with a fallback to the `lock` field).

```
Offset  Size      Field           Description
------  --------  --------------  ----------------------------------------
0       1         path_flag       0x00 (TEE update)
1       84        public_inputs   Serialized PublicInputs (see below)
85      32        vk_hash         SP1 verification key hash
117     4         proof_len       Length of SP1 proof in bytes (u32 LE)
121     variable  proof           Raw SP1 PLONK proof bytes
```

**Minimum header size:** 121 bytes (before proof data).

#### PublicInputs (84 bytes)

The public inputs committed to in the SP1 proof:

```
Offset  Size  Field              Type    Description
------  ----  -----------------  ------  ----------------------------------------
0       32    program_hash       [u8]    SP1 scoring program hash
32      32    user_identity      [u8]    Blake2b identity commitment
64      2     prev_score         u16 LE  Score from input cell (must match)
66      2     new_score          u16 LE  Newly computed score
68      4     epoch              u32 LE  New epoch number
72      2     privacy_score      u16 LE  Privacy component
74      2     contribution_score u16 LE  Contribution component
76      2     humanity_score     u16 LE  Humanity component
78      2     community_score    u16 LE  Community component
80      4     prev_epoch         u32 LE  Previous epoch (must match input)
------  ----
Total: 84 bytes
```

### User Direct Path (path flag = 0x01)

Used when the user performs operations with their own private key (deposit top-up, cell migration, cell closure). The witness is stored in the `lock` field of `WitnessArgs`.

```
Offset  Size  Field       Description
------  ----  ----------  ----------------------------------------
0       1     path_flag   0x01 (user direct)
1       65    signature   secp256k1 recoverable signature (r[32] + s[32] + recovery_id[1])
------  ----
Total: 66 bytes
```

---

## Lock Script Paths

The Haven lock script (`haven-lock-script`) implements a dual-path unlocking mechanism using dynamic loading of the CKB system secp256k1 shared library.

### Path 1: TEE Score Update (0x00)

**Purpose:** Allow the Phala TEE to update score cells without user interaction.

**Verification steps:**
1. Parse path flag from witness byte 0 (must be `0x00`)
2. Verify at least one output cell with the same lock also carries a type script (prevents stripping the type script to bypass validation)
3. Extract the 65-byte TEE secp256k1 signature from the witness
4. Build the sighash-all message hash (tx_hash + zeroed lock field + all witnesses)
5. Recover the public key from the signature using the dynamically loaded secp256k1 library
6. Blake2b-160 hash the recovered pubkey and compare against `tee_pubkey_hash` in lock args

**Constraints enforced:**
- TEE cannot remove the type script from the output cell
- TEE cannot change the lock script args (user retains ownership)
- All score transition rules are enforced by the type script, not the lock script

### Path 2: User Direct Control (0x01)

**Purpose:** Allow the cell owner to manage their score cell with their private key.

**Verification steps:**
1. Parse path flag from witness byte 0 (must be `0x01`)
2. Extract the 65-byte secp256k1 recoverable signature
3. Build the sighash-all message hash
4. Recover the public key and Blake2b-160 hash it
5. Compare against `user_pubkey_hash` in lock args

**Permitted operations:**
- Top up deposit balance (add CKBytes to the cell -- type script allows without proof)
- Migrate to a new cell version
- Reclaim all CKBytes and close the cell

**Ownership guarantee:** Even if Haven Protocol ceases to operate, users can always reclaim their CKBytes using Path 2 with their private key.

**Dynamic loading:** The lock script loads the CKB system secp256k1 shared library from a dep cell using `CKBDLContext`. The transaction must include two system dep cells: the secp256k1 code cell (shared library ELF) and the secp256k1 data cell (1,048,576 bytes precomputed tables).

---

## Notification System

The TEE creates notifications after each scoring cycle and stores them in the `notifications` PostgreSQL table.

### Notification Types

| Type | Trigger | Content |
|------|---------|---------|
| `score_update` | User's score changed | Old score, new score, delta, direction, epoch |
| `tier_change` | User's tier changed | Old tier, new tier |
| `deposit_low` | Deposit balance below threshold | Balance in CKB |
| `system` | Protocol-level events | Title, message |

### Notification Flow

1. **Scoring scheduler** processes a user and computes a new score.
2. If the score changed, `NotificationService.notifyScoreUpdate()` creates a `score_update` notification.
3. If the tier changed, `NotificationService.notifyTierChange()` creates a `tier_change` notification.
4. If the deposit balance is below `LOW_BALANCE_THRESHOLD`, `NotificationService.notifyLowBalance()` creates a `deposit_low` notification.
5. Notification failures never break the scoring pipeline -- they are caught and logged.

### Notification API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications?commitment=...&limit=...&unreadOnly=...` | GET | Fetch notifications |
| `/api/notifications/unread-count?commitment=...` | GET | Get unread count |
| `/api/notifications/:id/read` | POST | Mark single notification as read |
| `/api/notifications/read-all?commitment=...` | POST | Mark all as read |

### Dashboard Integration

The SDK's `useNotifications` React hook provides:
- Automatic polling of unread count every 30 seconds
- Full notification list fetched on mount and on manual refresh
- `markAsRead(id)` and `markAllAsRead()` actions
- Optimistic UI updates (local state updated immediately, then synced)

The dashboard displays a bell icon with an unread count badge in the navigation.

---

## Health Monitoring

The TEE exposes `GET /api/health` returning real runtime status:

```json
{
  "teeHealth": "online",
  "enclaveId": "abc123...",
  "lastAttestation": "2026-04-06T12:00:00.000Z",
  "protocolVersion": "0.1.0",
  "uptime": 86400
}
```

### Health Status Logic

- `online` -- Enclave ID resolved from dstack `info()`. TEE is running inside a genuine enclave.
- `degraded` -- Process is running but enclave ID is unknown (running outside enclave, e.g. local development).
- `offline` -- Service is unreachable.

### Data Sources

- `enclaveId` -- Retrieved from dstack `info()` on module initialization (instanceId or appId).
- `lastAttestation` -- Tracked by the `AttestationService` each time a DCAP attestation is generated.
- `protocolVersion` -- Read from `package.json` on module initialization.
- `uptime` -- `process.uptime()` in seconds.

The SDK's `HavenTeeClient.getHealth()` method fetches this data. The dashboard displays it in the footer and on the Identity page.

---

## Security Model

Haven's security model creates a trust chain from the TEE hardware through the SP1 proof system to the CKB on-chain verifier.

### Trust Chain

```
Phala TDX Hardware
    |
    | DCAP attestation (proves genuine TEE execution)
    v
SP1 Proof Worker
    |
    | SP1 PLONK proof (proves correct computation over valid attestation)
    v
CKB Type Script
    |
    | On-chain verification (final authority -- rejects invalid proofs)
    v
Score Cell Updated
```

### What Each Layer Guarantees

| Layer | Guarantee |
|-------|-----------|
| **Phala TDX TEE** | Code executed in an isolated enclave. Account linkages stored in TEE-local PostgreSQL, inaccessible to external parties. DCAP attestation proves the enclave is genuine. |
| **SP1 Proof** | The scoring program (identified by program hash H) was executed correctly inside a genuine TEE as proven by a valid DCAP attestation, producing the claimed score. |
| **CKB Type Script** | The SP1 proof is valid, the program hash matches the Registry, the identity is unchanged, the epoch incremented, the fee was deducted correctly, the breakdown sums to the total, and the expiry is set correctly. |
| **CKB Lock Script** | The TEE can only update through the type-script-guarded path with a valid TEE signature. The user always retains ownership via their private key. |

### Program Hash Pinning

The Registry cell stores the current valid program hash. This prevents silent scoring formula changes:

1. Haven publishes a new scoring program binary
2. The program hash is computed and submitted to the Registry cell via multisig transaction
3. The previous program hash enters a grace period (configurable `grace_epochs`)
4. The type script accepts proofs generated against either hash during the grace window
5. After the grace period, only the new hash is valid

All Registry cell updates are on-chain and publicly visible.

### Privacy Guarantees

| Data | Where It Exists | Who Can See It |
|------|-----------------|----------------|
| Haven Score, breakdown, tier | On-chain (score cell) | Everyone |
| Identity commitment (hash of CKB pubkey) | On-chain (score cell) | Everyone |
| Twitter account linkage | TEE-local PostgreSQL only | TEE enclave only |
| GitHub account linkage | TEE-local PostgreSQL only | TEE enclave only |
| Wallet linkages | TEE-local PostgreSQL only | TEE enclave only |
| OAuth tokens | TEE-local PostgreSQL only | TEE enclave only |
| Raw activity data | Discarded after scoring | Nobody (ephemeral) |

### Score Expiry

Score cells have an `expires_at` field set to `issued_at + epoch_duration`. The SDK and type script both reject expired scores. This prevents inactive users from holding stale high scores indefinitely.

### Deposit Protection

The type script enforces that the TEE update path can only deduct exactly the `per_update_fee` from the deposit balance. No other CKBytes can leave the cell through Path 1. The remaining balance and cell capacity require the user's private key (Path 2) to move.

### Top-Up Safety

The type script's `is_topup_only` check ensures that user top-up transactions can only increase the deposit balance. All other fields must remain identical. This prevents users from modifying their score through the top-up path.

### Sybil Resistance

Multiple wallets belonging to the same human are identified and deduplicated inside the TEE using cross-platform consistency signals. The score reflects the human, not the wallet count. Splitting identities provides no scoring advantage because each identity starts at zero with no history.

---

## SDK Architecture

The Haven SDK (`@haven-protocol/ckb-sdk`) is structured as a single package with multiple entry points.

### Package Structure

```
@haven-protocol/ckb-sdk
├── .                    # Core: HavenClient, types, cell parser, constants
├── /react               # React hooks: HavenProvider, useHavenScore, useHavenGate,
│                        #   useLeaderboard, useAuth, useDeposit, useNotifications
├── /tee                 # TEE client: HavenTeeClient (OAuth, identity, health, notifications)
├── /contracts           # Script builders, cell builders, deploy info
└── /attestations        # Off-chain attestation generation
```

### Layer Diagram

```
+--------------------------------------------------------------+
|                     React Hooks Layer                         |
|  useHavenScore  useHavenGate  useLeaderboard  useAuth        |
|  useDeposit     useNotifications  HavenProvider              |
+-------------------------------+------------------------------+
                                |
+-------------------------------v------------------------------+
|                     HavenClient (Core)                       |
|  getScore()  verifyThreshold()  verifyTier()                 |
|  getLeaderboard()  generateScoreAttestation()                |
|  getMyScore()  getScoreByIdentity()  getRegistryConfig()     |
+-------------------------------+------------------------------+
                                |
+-------------------------------v------------------------------+
|                    Cell Parser / Constants                    |
|  parseScoreCell()  serializeScoreCell()  getTierForScore()   |
|  CELL_OFFSETS  TIER_THRESHOLDS  SCORE_CELL_SIZE              |
+-------------------------------+------------------------------+
                                |
+-------------------------------v------------------------------+
|                      CCC (@ckb-ccc/core)                     |
|  Client  findCellsByType  getCellLive  getTip                |
+--------------------------------------------------------------+

+--------------------------------------------------------------+
|                  HavenTeeClient (Separate)                   |
|  getHealth()  registerIdentity()  getCommitment()            |
|  checkIdentity()  getConnectionStatus()                      |
|  getTwitterAuthUrl()  completeTwitterAuth()                  |
|  getGithubAuthUrl()   completeGithubAuth()                   |
|  requestScoreRefresh()                                       |
|  getNotifications()  getUnreadCount()                        |
|  markNotificationRead()  markAllNotificationsRead()          |
+--------------------------------------------------------------+
```

### Key Design Decisions

1. **CCC as the only CKB dependency.** The SDK uses `@ckb-ccc/core` exclusively.

2. **No Haven server dependency.** All score reads go directly to CKB. The TEE client is only needed for identity registration, OAuth, notifications, and health -- not for reading scores.

3. **React is optional.** The core `HavenClient` works in any TypeScript environment. React hooks are available at the `/react` sub-path and have `react` as an optional peer dependency.

4. **Typed cell parsing.** The 127-byte score cell data is parsed into a typed `HavenScore` interface with all fields available as native TypeScript types.

5. **Modular TEE client.** The `HavenTeeClient` handles all communication with the TEE service, including identity registration, OAuth, health checks, and the full notification lifecycle (fetch, unread count, mark read, mark all read).

6. **Notification polling.** The `useNotifications` hook polls the unread count every 30 seconds (lightweight GET request) and fetches the full notification list on demand. This avoids WebSocket complexity while keeping the UI responsive.
