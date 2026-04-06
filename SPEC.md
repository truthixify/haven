**HAVEN PROTOCOL**

**on CKB**

Privacy Reputation & Incentivized Discovery Layer

Technical Specification & Architecture

2026

# **1. Executive Summary**

Haven Protocol is a privacy reputation and incentivized discovery layer built natively on Nervos CKB. Users earn a public, non-transferable Haven Score based on their real activity across Twitter, GitHub, and on-chain ecosystems. The score is fully visible -- it appears on public dashboards, leaderboards, and is readable by any dApp on CKB. What is never visible is the identity behind the score.

When users connect their Twitter, GitHub, and wallets to Haven, those account linkages are stored exclusively inside a Phala Network TEE (Trusted Execution Environment) in a PostgreSQL database running locally within the TEE container. Nobody outside the TEE -- not Haven contributors, not any external database, not on-chain observers -- can ever know which Twitter account, GitHub profile, or set of wallets belongs to a given Haven Score. The TEE hardware protects the environment, and the data never leaves.

There is no traditional backend. The Phala TEE handles all computation, all proof requests, and all on-chain settlement. The proof worker is a separate SP1 prover service that the TEE calls to generate proofs and returns results to. The TEE then submits CKB transactions directly using CCC.

| Core Design | Public score. Private identity. No backend. The TEE is the only system that knows who you are, and it proves it computed your score correctly without revealing anything about you. |
| :---: | :---- |

# **2. The Privacy Model**

Haven's privacy model is specific and worth stating clearly upfront, because it is different from what most privacy protocols do.

## **2.1 What Is Public**

* The Haven Score (a number from 0 to 1000)

* The score breakdown by component (privacy hygiene, contribution, humanity, community)

* The score tier (Observer, Initiate, Trusted, Guardian, Sovereign)

* The identity commitment (a hash of the user's CKB public key -- not the key itself)

* The score epoch and expiry

* Everything above is on-chain, readable by anyone, and shown on the Haven leaderboard

## **2.2 What Is Private**

* Which Twitter account is linked to this score

* Which GitHub profile contributed to this score

* Which EVM or other chain wallets belong to this same human

* The raw activity data that went into the score computation

* Any linkage between the Haven Score cell and a real-world identity

## **2.3 How Privacy Is Enforced**

All account linkages are stored in a PostgreSQL database running locally inside the Phala TEE container. The TEE hardware ensures that no external process -- not even the host operating system -- can access this data. OAuth tokens, account IDs, and wallet-to-identity mappings live exclusively in the TEE's local database. The TEE reads connected accounts, runs the scoring computation, and produces a score and attestation. No Haven database outside the TEE, no logs, no API server ever sees which accounts a user connected.

| The Beauty of Haven | A user can have a public Haven Score of 920, sit at the top of the leaderboard, and get hired through the Shadow Job Board -- all without anyone knowing their real name, Twitter handle, GitHub username, or which wallets they own. |
| :---: | :---- |

# **3. Why CKB**

| CKB Property | Why It Matters for Haven |
| :---- | :---- |
| **RISC-V VM** | SP1 proofs can be verified natively in scripts without EVM precompile limitations |
| **Cell model** | Score state lives in a user-owned cell. The TEE updates it, the user owns it. |
| **Dual-path lock script** | TEE can submit score updates. Users retain full ownership and can always reclaim CKBytes. |
| **Type scripts as validators** | Score update rules enforced by the type script. No override possible. |
| **Capacity model** | Users pre-deposit CKBytes. Update fees deducted automatically from deposit. |
| **Composability** | Any CKB dApp reads Haven Score cells directly with CCC. No Haven server dependency. |
| **Open cell reads** | Score is public on-chain. Leaderboards and dApp gating work without any API. |

# **4. System Components**

Haven Protocol has five components. There is no traditional backend server.

## **4.1 Phala TEE (Core)**

The Phala Network TEE is the heart of Haven Protocol. It is the only component that handles sensitive data. Everything else is either on-chain or a stateless compute service.

The TEE is a NestJS service that runs inside a Phala dstack Intel TDX enclave. It is responsible for:

* Receiving connected account credentials from users (Twitter OAuth tokens, GitHub tokens, wallet signatures)

* Storing account linkages in a PostgreSQL database running locally inside the TEE container

* Reading activity data from connected accounts via their APIs

* Running the Haven scoring program over the collected activity every 5 minutes (configurable via `SCORING_CRON`)

* Generating a DCAP attestation proving the computation ran inside a genuine TEE

* Calling the SP1 proof worker with the attestation and requesting a proof

* Receiving the SP1 proof back from the proof worker

* Constructing CKB transactions using CCC

* Submitting transactions to CKB on-chain

* Deducting update fees from the user's deposit balance in each transaction

* Creating user notifications on score changes, tier changes, and low deposit balance

* Exposing a health endpoint (`GET /api/health`) with enclave ID, uptime, last attestation, and protocol version

Phala Network is chosen specifically because it supports Intel TDX with DCAP (Data Center Attestation Primitives) attestation. DCAP attestations are verifiable by SP1 and are the standard for production TEE deployments. Phala also provides managed TEE infrastructure, removing the need for Haven to operate raw SGX or TDX hardware.

### **4.1.1 Storage Model**

The TEE uses PostgreSQL (via TypeORM) running locally inside the TEE container. The database is co-located with the service via Docker Compose. Three tables store all persistent data:

**users** -- Registered identities

| Column | Type | Description |
| :---- | :---- | :---- |
| `identityCommitment` | varchar (PK) | Blake2b hash of CKB public key |
| `ckbPubKey` | varchar | User's CKB public key or address |
| `lockCodeHash` | varchar (nullable) | Lock script code hash (supports omnilock, JoyID, secp256k1) |
| `lockHashType` | varchar (nullable) | Lock script hash type |
| `lockArgs` | varchar (nullable) | Lock script args |
| `lastScoredEpoch` | int (nullable) | Last epoch this user was scored |
| `lastComputedScore` | int (nullable) | Most recently computed score |
| `scoreCellOutpoint` | jsonb (nullable) | `{ txHash, index }` of user's on-chain score cell |
| `createdAt` | timestamp | Auto-generated |
| `updatedAt` | timestamp | Auto-generated |

**connections** -- Modular provider connections (one row per provider per user)

| Column | Type | Description |
| :---- | :---- | :---- |
| `id` | uuid (PK) | Auto-generated |
| `identityCommitment` | varchar (indexed, FK to users) | User identity |
| `provider` | varchar | Provider name: `twitter`, `github`, `linkedin`, `discord`, `telegram`, etc. |
| `providerId` | varchar | User's ID on that platform |
| `accessToken` | varchar (nullable) | OAuth access token |
| `refreshToken` | varchar (nullable) | OAuth refresh token |
| `metadata` | jsonb (nullable) | Provider-specific data (username, avatar, etc.) |
| `reputationWeight` | decimal(5,2) | How much this provider contributes to score (0-100) |
| `connectedAt` | timestamp | Auto-generated |
| `updatedAt` | timestamp | Auto-generated |

Unique constraint: `(identityCommitment, provider)` -- one connection per provider per user.

**notifications** -- User notification queue

| Column | Type | Description |
| :---- | :---- | :---- |
| `id` | uuid (PK) | Auto-generated |
| `identityCommitment` | varchar (indexed) | User identity |
| `type` | varchar | `score_update`, `tier_change`, `deposit_low`, `epoch_complete`, `system` |
| `title` | varchar | Notification title |
| `message` | text | Notification body |
| `read` | boolean | Whether the user has read this notification (default false) |
| `metadata` | jsonb (nullable) | Structured data (scores, tiers, balances, etc.) |
| `createdAt` | timestamp | Auto-generated |

Adding a new provider (e.g. LinkedIn, Discord, Telegram) requires no schema change -- just insert a new row in the `connections` table with the appropriate `provider` value.

### **4.1.2 TEE Modules**

The NestJS service is organized into the following modules:

| Module | Responsibility |
| :---- | :---- |
| **StorageModule** | PostgreSQL database access (users, connections) |
| **AuthModule** | OAuth strategies (Twitter, GitHub) and session guards |
| **IdentityModule** | CKB wallet identity verification and commitment generation |
| **ScoringModule** | Score computation (collectors, formulas, scheduler) |
| **AttestationModule** | DCAP attestation generation and proof worker client |
| **ChainModule** | CKB transaction building, cell serialization, registry reads |
| **NotificationModule** | User notification creation, retrieval, and read-marking |
| **HealthModule** | Health/status endpoint with enclave info |

## **4.2 SP1 Proof Worker**

The SP1 proof worker is a stateless Rust service (Axum HTTP server) that generates DCAP attestation proofs. It uses Automata's `automata-dcap-zkvm` (v1.1.1-alpha-3) with SP1 PLONK proofs.

* Input: Hex-encoded TDX quote from the TEE (not base64). The proof worker strips a 4-byte simulator header when present (detected by checking if bytes 0-1 are not a valid TDX version but bytes 4-5 are).

* Output: SP1 PLONK proof bytes, public values (journal), Blake2b proof hash, SP1 program ID, and verification key hash.

* Stateless: no storage, no user data, no session state.

* Proof generation uses Succinct's SP1 Network for remote proving, with configurable mode: `auction` (cheapest), `hosted` (faster), or `reserved` (predictable).

* DCAP collaterals are fetched from Automata's on-chain PCCS contracts on Ethereum (Sepolia for testnet, mainnet for production) via a standard Ethereum RPC endpoint.

* The proof worker can be run by Haven or by any third party -- it has no privileged access.

* Runs on port 3001 by default.

## **4.3 Haven Dashboard (Frontend)**

A React + Vite + Tailwind CSS web application with a "Sovereign" design system. The dashboard communicates directly with the Phala TEE for account connections and reads score data directly from CKB via CCC. There is no intermediary API server.

Features:

* **Sidebar navigation:** Dashboard, Identity, Leaderboard, Ecosystem pages
* **CCC wallet connect** with custom wallet profile popover
* **Score visualization** with score history chart using data-driven rendering
* **Public leaderboard** showing all Haven Score cells sorted by score
* **Notification system** with bell icon, unread count badge, and 30-second polling
* **Action loading overlay** during long-running operations
* **Health status display** in footer and identity page (enclave ID, uptime, last attestation)
* **Deposit top-up** via CKB transaction signed with CCC

| Dashboard Action | How It Works |
| :---- | :---- |
| **Connect Twitter / GitHub** | OAuth flow redirects back to dashboard, token passed directly to Phala TEE |
| **Connect CKB wallet** | CCC wallet connect in browser, signature passed to TEE for identity setup |
| **View score** | Read score cell directly from CKB via CCC |
| **View leaderboard** | Query all Haven Score cells from CKB, sort by score field |
| **Top up deposit** | User signs a CKB transaction via CCC to add CKBytes to their score cell |
| **View notifications** | SDK hook polls TEE notifications endpoint every 30 seconds |
| **Check TEE health** | SDK client calls `GET /api/health` endpoint |

Runs on port 5173 (Vite dev server).

## **4.4 Haven SDK**

The Haven SDK (`@haven-protocol/ckb-sdk`) is a TypeScript library built on CCC with sub-path exports:

| Sub-path | Description |
| :---- | :---- |
| `@haven-protocol/ckb-sdk` | Core: HavenClient, types, cell parser, constants |
| `@haven-protocol/ckb-sdk/react` | React hooks: HavenProvider, useHavenScore, useHavenGate, useLeaderboard, useAuth, useDeposit, useNotifications |
| `@haven-protocol/ckb-sdk/tee` | HavenTeeClient: identity registration, OAuth flows, health, notifications, score refresh |
| `@haven-protocol/ckb-sdk/contracts` | Script builders, cell builders, deploy info |
| `@haven-protocol/ckb-sdk/attestations` | Off-chain attestation generation |

React is an optional peer dependency. The core client works in any TypeScript environment.

## **4.5 CKB On-Chain Scripts**

Two CKB scripts deployed on testnet with type-id (upgradable):

* **haven-type-script** -- Validates all score cell state transitions: creation (score=0, valid deposit), update (SP1 proof verification, public inputs matching, fee deduction, epoch increment), top-up (deposit_balance increase with everything else identical -- no proof required), and destruction (always allowed).

* **haven-lock-script** -- Dual-path lock: TEE update path (0x00) verifies TEE secp256k1 signature and ensures type script is present on the output cell. User direct path (0x01) verifies user secp256k1 signature for top-ups, migration, or cell closure. Uses dynamic loading of the CKB system secp256k1 shared library.

# **5. End-to-End Flow**

## **5.1 First-Time User Setup**

1. User visits Haven dashboard and clicks Connect Wallet.

2. CCC wallet connect flow runs in the browser. User signs an identity message.

3. Dashboard passes the signed message to the Phala TEE's `/api/identity/verify` endpoint.

4. TEE creates an identity commitment: Blake2b hash of the user's CKB public key. The user record is stored in the TEE's local PostgreSQL database.

5. User connects Twitter via OAuth. Token passed directly to TEE. TEE stores the connection in the `connections` table and reads initial activity.

6. User connects GitHub via OAuth. Token passed directly to TEE. TEE stores the connection in the `connections` table and reads contribution history.

7. User pre-deposits CKBytes from their wallet. This creates the initial Haven Score cell on CKB with score = 0.

| Account Security | OAuth tokens and account linkages are passed directly from the browser to the Phala TEE. They are stored in the TEE's local PostgreSQL database, which is protected by the TEE hardware. No Haven database outside the TEE, server, or log ever sees these tokens. |
| :---: | :---- |

## **5.2 Score Update Cycle (Automatic, Every 5 Minutes)**

8. Scoring interval triggers inside the Phala TEE (configurable via `SCORING_CRON`, default `*/5 * * * *`).

9. TEE reads the PostgreSQL database to retrieve user records and their connection tokens.

10. TEE calls Twitter API, GitHub API, and CKB indexer using the stored tokens to collect new activity.

11. TEE runs the Haven scoring program over the collected activity. Computes score and breakdown.

12. TEE generates a Phala DCAP attestation over the scoring output (if proof worker is available).

13. TEE calls the SP1 proof worker with the DCAP attestation (if available).

14. SP1 proof worker generates proof of correct TEE execution and returns it to the TEE (if available).

15. TEE constructs a CKB transaction using CCC: input is the current score cell, output is the new score cell with updated score (if proof is available and score cell outpoint exists).

16. TEE signs and submits the transaction to CKB.

17. CKB type script verifies the SP1 proof. If valid, old score cell is consumed and new score cell is created.

18. Update fee is deducted from deposit_balance in the new score cell.

19. Score is now live on-chain. Dashboard and leaderboard reflect it automatically.

20. TEE creates notifications for the user: score update notification (if score changed), tier change notification (if tier changed), and low balance notification (if deposit is below threshold).

Steps 12-16 are skipped gracefully when the proof worker is unavailable. The score is still computed and stored in the database, and notifications are still created. Users are processed in batches of 10 to avoid overwhelming external APIs.

## **5.3 dApp Score Verification (No Haven Involvement)**

21. User visits a third-party dApp that uses Haven Score gating.

22. dApp uses Haven SDK to query the user's score cell from CKB via CCC.

23. Haven SDK reads the score, epoch, and expiry from the cell data.

24. SDK checks score meets threshold and cell is not expired.

25. dApp grants or denies access based on the result.

26. Haven Protocol is never contacted. No API call. Pure on-chain verification.

# **6. Phala DCAP + SP1 Proof System**

## **6.1 Why Phala**

* Phala Network provides managed TDX TEE infrastructure with DCAP attestation support

* DCAP (Data Center Attestation Primitives) is the Intel standard for verifiable TEE attestations -- no EPID, no Intel IAS dependency

* Phala's DCAP attestations are structured and verifiable by SP1 proving systems

* Phala removes the need for Haven to operate raw TDX hardware

* Phala's dstack SDK provides the attestation API (`@phala/dstack-sdk`) for generating TDX quotes

## **6.2 Why SP1**

* SP1 (Succinct's zkVM) can prove arbitrary Rust program execution

* Integrates cleanly with DCAP attestations as program inputs

* Produces proofs that CKB's RISC-V VM can verify natively

* Succinct maintains SP1 as production-grade infrastructure used by major protocols

* Proof generation is async and batched -- acceptable for Haven's interval-based update model

## **6.3 Proof Worker Implementation**

The proof worker uses Automata's `automata-dcap-zkvm` library (v1.1.1-alpha-3) with the `sp1` feature. The proof generation pipeline:

1. Receive hex-encoded TDX quote from the TEE.
2. Strip 4-byte simulator header if present (detected by TDX version check at byte offsets 0 and 4).
3. Use DCAP v1.1 for TDX v4/v5 quotes.
4. Create an Alloy provider connected to Ethereum RPC for fetching DCAP collaterals from Automata's on-chain PCCS.
5. Prepare guest input via `prepare_guest_input()` (fetches collaterals).
6. Create `Sp1Prover` with Automata's pre-built DCAP verifier ELF.
7. Generate SP1 proof via Succinct's SP1 Network (PLONK by default).
8. Compute Blake2b hash of the proof bytes (with `haven-protocol00` personalization).
9. Return proof bytes, public values (journal), proof hash, program ID, and verification key hash.

## **6.4 What the SP1 Proof Attests**

| SP1 Proof Statement | The Haven scoring program, identified by program hash H, was executed correctly inside a genuine Phala TDX enclave as proven by a valid DCAP attestation, over activity inputs for user identity commitment I collected during epoch N, and produced a new score S. |
| :---: | :---- |

Public inputs verified by the CKB type script:

* Program hash H -- identifies the exact scoring program version

* User identity commitment I -- Blake2b hash of CKB public key

* Previous score -- must match the consumed input score cell

* New score S

* Epoch number N -- prevents replay of old proofs

* Score breakdown (privacy, contribution, humanity, community)

* Previous epoch -- must match the consumed input score cell

Everything else -- account linkages, raw activity, intermediate scores -- is private input inside the TEE and never appears in the proof's public inputs.

## **6.5 Program Hash Versioning**

The Haven Registry cell on CKB stores the current valid scoring program hash. When the scoring formula is updated, Haven publishes a new program binary, its hash is computed, and the Registry cell is updated via Haven multisig. The type script rejects proofs generated against outdated program hashes. A grace period allows both old and new hashes during transitions.

# **7. Cell Structure**

## **7.1 Haven Score Cell**

Each user has exactly one Haven Score cell on CKB. Score and all breakdown fields are public -- readable by anyone querying CKB.

| Field | Size | Description |
| :---- | :---- | :---- |
| **version** | 1 byte | Cell schema version |
| **score** | 2 bytes | Haven Score, u16, 0 to 1000. Public. |
| **epoch** | 4 bytes | Score epoch number, u32. Increments each update. |
| **user_identity** | 32 bytes | Blake2b hash of CKB public key. Ownership proof, no raw key stored. |
| **program_hash** | 32 bytes | Hash of SP1 scoring program used for this update. |
| **proof_hash** | 32 bytes | Blake2b hash of the SP1 proof. For auditability. |
| **score_breakdown** | 8 bytes | Packed 2-byte scores per component: privacy, contribution, humanity, community. Public. |
| **issued_at** | 4 bytes | CKB block number of last update. |
| **expires_at** | 4 bytes | Block number after which score is stale. |
| **deposit_balance** | 8 bytes | Remaining pre-deposited CKBytes for update fees, u64. |

Total cell data: 127 bytes. Score and breakdown are fully public on-chain.

## **7.2 Haven Registry Cell**

Single global cell controlled by Haven Protocol multisig. Contains:

* Current valid SP1 program hash

* Previous program hash (grace period)

* Score epoch duration in CKB blocks

* Minimum deposit amount to create a score cell

* Per-update fee in CKBytes

* Protocol fee address

* Score tier thresholds

* Registry schema version

* Grace epochs for program hash transitions

* Low-balance warning threshold

## **7.3 Type Script Top-Up Check**

The Haven type script includes an `is_topup_only` check. When a user submits a transaction where the only change to the score cell is an increase in `deposit_balance` (all other fields identical), the type script allows the transaction without requiring an SP1 proof. This enables users to top up their deposit directly without TEE involvement.

# **8. Dual-Path Lock Script**

The score cell uses a custom lock script with two unlock paths. The TEE can update the score. The user always retains full ownership.

Lock args (40 bytes): `[0..20] user_pubkey_hash` (Blake2b-160 of user secp256k1 pubkey) + `[20..40] tee_pubkey_hash` (Blake2b-160 of TEE secp256k1 pubkey).

## **Path 1: TEE Score Update (0x00)**

The Phala TEE can unlock and update the score cell, but only under strict conditions:

* The TEE secp256k1 signature must verify against the `tee_pubkey_hash` in lock args

* At least one output cell with the same lock must carry a type script (prevents stripping the type script to bypass validation)

* A valid SP1 proof must be present in the transaction witness (verified by the type script)

* The proof must verify against the current program hash in the registry

* The output cell must preserve user_identity unchanged

* The output cell epoch must be greater than the input cell epoch

* Only the update fee can leave deposit_balance -- no other CKBytes can exit

The TEE cannot write an arbitrary score. It cannot drain the cell. It cannot change the identity. The SP1 proof is the only gate.

## **Path 2: User Direct Control (0x01)**

The user can always unlock their score cell with their own CKB private key (standard secp256k1 recoverable signature) to:

* Top up their deposit balance (type script allows this without proof)

* Migrate to a new cell version

* Reclaim their CKBytes and close the cell

The lock script uses dynamic loading of the CKB system secp256k1 shared library via `CKBDLContext` for signature verification. The transaction must include the secp256k1 code cell and data cell (1 MB precomputed tables) as cell deps.

| Ownership Guarantee | If Haven Protocol shut down tomorrow, every user could reclaim their CKBytes with their private key. The TEE update path is write access for score updates only -- it is not ownership. The user always holds the keys. |
| :---: | :---- |

# **9. Fee Model: Pre-Deposit**

Score update transactions are submitted by the Phala TEE. Fees come from each user's pre-deposited CKBytes balance stored in their score cell. Users never need to sign or approve individual updates.

| Cost Component | Estimated Amount |
| :---- | :---- |
| **Cell capacity (127 bytes)** | ~200 CKBytes minimum |
| **Recommended initial deposit buffer** | 500 CKBytes |
| **Per-update fee (CKB network + protocol)** | ~2 to 5 CKBytes |
| **Updates before top-up needed** | ~100 to 250 updates from initial deposit |

When deposit_balance drops below a threshold defined in the Registry cell, the TEE creates a low-balance notification for the user, and the dashboard shows a low balance warning. The TEE continues updates for a grace period. If balance reaches zero, updates pause until the user tops up via Path 2 of the lock script.

# **10. CCC Integration**

Haven Protocol uses CCC (Common Chain Connector) exclusively for all CKB interactions.

## **10.1 TEE Usage (Transaction Submission)**

The Phala TEE uses CCC server-side to build and submit score update transactions:

```ts
import { ccc } from '@ckb-ccc/core';

const client = new ccc.ClientPublicMainnet();
const signer = new ccc.SignerCkbPrivateKey(client, TEE_SIGNING_KEY);

const tx = ccc.Transaction.from({
  inputs: [{ previousOutput: userScoreCellOutpoint }],
  outputs: [newScoreCell],
  witnesses: [sp1ProofBytes],
});

await tx.completeInputsByCapacity(signer);
await tx.completeFeeBy(signer, 1000);
const txHash = await signer.sendTransaction(tx);
```

## **10.2 Dashboard Usage (Wallet Connect)**

The dashboard uses CCC wallet connect for CKB wallet integration, supporting multiple wallet types including JoyID and standard secp256k1 wallets.

## **10.3 Leaderboard Query**

The leaderboard reads all Haven Score cells directly from CKB -- no API, no server:

```ts
const cells = await client.findCells({
  script: HAVEN_TYPE_SCRIPT,
  scriptType: 'type',
});

const scores = cells
  .map(cell => parseScoreFromCellData(cell.outputData))
  .sort((a, b) => b.score - a.score);
```

# **11. Haven SDK for dApp Developers**

The Haven SDK is a TypeScript library built on CCC. dApps use it to read and verify Haven Scores directly from CKB. No Haven API keys. No Haven server. Pure on-chain reads.

## **11.1 Core API**

**getScore(lockHash)**

```ts
const score = await haven.getScore(userLockHash);
// { score: 820, tier: 'Sovereign', epoch: 22, isValid: true,
//   breakdown: { privacy: 340, contribution: 250, humanity: 160, community: 70 },
//   depositBalance: 280, expiresAt: 10234100 }
```

**verifyThreshold(lockHash, minScore)**

```ts
const eligible = await haven.verifyThreshold(userLockHash, 650);
// true | false -- checks score and expiry
```

**verifyTier(lockHash, tier)**

```ts
const ok = await haven.verifyTier(userLockHash, 'Guardian');
// true if score >= Guardian threshold and not expired
```

**getLeaderboard(limit)**

```ts
const top100 = await haven.getLeaderboard(100);
// Array of { identityCommitment, score, tier, breakdown, epoch }
// Sorted by score descending. No real identities exposed.
```

## **11.2 TEE Client API**

The `HavenTeeClient` communicates with the TEE for identity-sensitive operations:

| Method | Description |
| :---- | :---- |
| `getHealth()` | Fetch TEE health status (teeHealth, enclaveId, lastAttestation, protocolVersion, uptime) |
| `registerIdentity(address, pubKey, sig, message, lockScript?)` | Register CKB wallet identity, returns identityCommitment |
| `getCommitment(ckbPubKey)` | Compute identity commitment without registering |
| `checkIdentity(identityCommitment)` | Check if identity is registered |
| `getTwitterAuthUrl(callbackUrl)` | Build Twitter OAuth URL |
| `completeTwitterAuth(identity, code, state)` | Complete Twitter OAuth flow |
| `getGithubAuthUrl(callbackUrl)` | Build GitHub OAuth URL |
| `completeGithubAuth(identity, code, state)` | Complete GitHub OAuth flow |
| `getConnectionStatus(identityCommitment)` | Check which accounts are linked |
| `requestScoreRefresh(identityCommitment)` | Trigger manual score refresh |
| `getNotifications(identity, limit?, unreadOnly?)` | Fetch user notifications |
| `getUnreadCount(identityCommitment)` | Get unread notification count |
| `markNotificationRead(id)` | Mark single notification as read |
| `markAllNotificationsRead(identityCommitment)` | Mark all notifications as read |

## **11.3 React Hooks**

| Hook | Description |
| :---- | :---- |
| `useHavenScore(lockHash)` | Fetch score with loading/error state |
| `useHavenGate(lockHash, minScore)` | Conditional rendering based on score threshold |
| `useLeaderboard(limitOrOptions)` | Fetch public leaderboard with auto-refresh |
| `useAuth()` | Track wallet and account connection state |
| `useDeposit()` | Manage deposit top-up operations |
| `useNotifications(teeClient, identity)` | Notification management with 30s polling |
| `useHavenClient()` | Access underlying HavenClient from context |

## **11.4 SDK Packages**

| Package | Description |
| :---- | :---- |
| **@haven-protocol/ckb-sdk** | Core SDK. Score reads, verification, leaderboard. Built on CCC. |
| **@haven-protocol/ckb-sdk/attestations** | Off-chain attestation generation for event and API gating. |
| **@haven-protocol/ckb-sdk/react** | React hooks: useHavenScore, useHavenGate, useLeaderboard, useAuth, useDeposit, useNotifications. |
| **@haven-protocol/ckb-sdk/tee** | TEE client: HavenTeeClient for identity, OAuth, health, notifications. |
| **@haven-protocol/ckb-sdk/contracts** | Script builders, cell builders, deploy info. |

# **12. Haven Score Tiers**

All tiers and scores are fully public on-chain and visible on the Haven leaderboard.

| Tier | Score Range | Access |
| :---- | :---- | :---- |
| **Observer** | 0 to 199 | Dashboard access, score tracking, basic platform features |
| **Initiate** | 200 to 399 | Funding pool participation, basic Haven Passes |
| **Trusted** | 400 to 649 | Shadow Job Board, Alpha Whitelists, private channels |
| **Guardian** | 650 to 849 | Governance voting, confidential AMAs, multiplier bonuses |
| **Sovereign** | 850 to 1000 | Full access, governance multiplier, exclusive funding pools |

# **13. Scoring Model**

The Haven scoring program runs inside the Phala TEE. It is a NestJS service with four formula modules that produce a deterministic score from verified activity inputs.

## **13.1 Component Weights**

| Component | Weight | Max Score | Signals |
| :---- | :---- | :---- | :---- |
| **Privacy Hygiene** | 40% | 400 | Address rotation patterns, transaction pattern diversity, total transactions, account age |
| **Ecosystem Contribution** | 30% | 300 | GitHub commits, governance participation, on-chain activity |
| **Proof of Human** | 20% | 200 | Sybil resistance signals, account age, cross-platform consistency |
| **Community Engagement** | 10% | 100 | Platform participation, on-chain activity patterns |

## **13.2 Scoring Pipeline**

The scoring service processes each user through this pipeline:

1. **Retrieve user record** from the PostgreSQL database (identity commitment, connected accounts).
2. **Fetch connection tokens** from the `connections` table for each provider.
3. **Collect activity in parallel** from three collectors:
   - **Twitter collector** -- Twitter API for privacy-related activity (only if Twitter is connected with valid token)
   - **GitHub collector** -- GitHub API for contribution history (only if GitHub is connected with valid token)
   - **On-chain collector** -- CKB indexer for on-chain activity (always collected; supports any lock script type: secp256k1, omnilock, JoyID)
4. **Run four scoring formulas** over the collected activity:
   - `privacy-hygiene.ts` -- Address rotation (40%), transaction diversity (30%), total transactions (20%), account age (10%). Uses sigmoid normalization with configurable half-saturation constants.
   - `contribution.ts` -- GitHub commits, governance participation (max 300)
   - `humanity.ts` -- Sybil resistance, account age, cross-platform consistency (max 200)
   - `community.ts` -- Platform participation (max 100)
5. **Sum components** to produce total score (0-1000).

Scores are rebalanced for CKB-only scoring: users without social accounts connected still receive meaningful scores from on-chain activity. Social connections enhance the score but are not required.

## **13.3 On-Chain Collector Details**

The on-chain collector queries the CKB indexer and analyzes:

* Total transaction count
* Recent transactions (last 30 days, estimated by block height at ~8 seconds/block)
* Unique addresses interacted with
* Address rotation patterns
* Live cell count and diversity
* Nervos DAO deposits
* Account age (estimated from first transaction)
* Shielded pool usage and privacy protocol balances (prepared for future privacy protocols on CKB)

The collector supports any lock script type. If the user registered with a full lock script (code hash, hash type, args), it uses that directly for indexer queries. Otherwise, it derives lock args from the stored public key using blake2b-160.

## **13.4 Formula Design**

The scoring formula is intentionally written as normal TypeScript code inside the TEE rather than a ZK circuit. This is a deliberate design choice: the inputs are heterogeneous real-world data from multiple APIs, and the formula will evolve over time. Encoding this in a circuit would require a new trusted setup ceremony on every update. The TEE + SP1 model allows formula updates by simply changing the program and updating the program hash in the Registry cell.

# **14. Notification System**

The TEE creates notifications after each scoring cycle:

* **Score update** -- Created when a user's score changes (includes old score, new score, delta, and epoch).
* **Tier change** -- Created when a user's tier changes (includes old tier and new tier).
* **Low balance** -- Created when deposit balance drops below the configured threshold (includes balance in CKB).
* **System** -- Generic system messages.

Notifications are stored in the `notifications` PostgreSQL table and served via the TEE's `/api/notifications` endpoints. The SDK's `useNotifications` React hook polls the unread count every 30 seconds and fetches the full notification list on demand. The dashboard displays a bell icon with an unread count badge.

# **15. Health Monitoring**

The TEE exposes `GET /api/health` returning:

```json
{
  "teeHealth": "online",
  "enclaveId": "abc123...",
  "lastAttestation": "2026-04-06T12:00:00.000Z",
  "protocolVersion": "0.1.0",
  "uptime": 86400
}
```

* `teeHealth`: `online` (enclave ID resolved), `degraded` (enclave ID unknown but process running), or `offline`.
* `enclaveId`: Instance ID or app ID from dstack `info()`.
* `lastAttestation`: ISO timestamp of the last DCAP attestation generated.
* `protocolVersion`: Read from `package.json`.
* `uptime`: Process uptime in seconds.

The dashboard footer and identity page display this data. The SDK's `HavenTeeClient.getHealth()` method fetches it.

# **16. Platform Features**

## **16.1 Public Leaderboard**

A fully public leaderboard showing all Haven Score cells sorted by score. Identity commitments are shown -- not real names, Twitter handles, or wallet addresses. Users can optionally link a pseudonym to their identity commitment if they choose to be recognizable, but this is never required.

## **16.2 Reputation-Based Funding Pools**

Monthly pools funded by ecosystem partners. Distribution is proportional to Haven Score percentile. Pool distribution logic runs entirely via CKB scripts reading score cells. No Haven admin involvement.

## **16.3 Haven Passes**

Event tickets and whitelist spots issued as CKB cells gated behind Haven Score thresholds. The pass type script verifies the user's score cell meets the minimum before issuing the pass.

## **16.4 Shadow Job Board**

Anonymous talent matching. Employers post opportunity cells with score tier requirements. Candidates apply by proving their tier. The employer sees a verified score and masked profile. Real identity disclosed only at the candidate's discretion after a formal offer.

## **16.5 Governance**

Voting weight derived from Haven Score. Votes are CKB transactions referencing the score cell. The governance script reads the score and applies the correct weight. One identity commitment maps to one score -- splitting identities provides no advantage.

# **17. Tokenomics**

Haven Protocol does not launch a new chain token. Incentives use CKBytes and Haven Credits (HC) as xUDT tokens on CKB.

| Mechanism | Implementation |
| :---- | :---- |
| **Haven Credits (HC)** | xUDT token on CKB. Earned through quests and score milestones. Non-transferable by default. |
| **Earning HC** | Verified quest completion generates SP1 proof inside TEE. Proof mints HC to user cell on-chain. |
| **Burning HC** | HC burned to reveal verified identity for job applications or boost project visibility. |
| **Shielded Vault Yield** | CKBytes locked in Haven vault cells earn yield from protocol pool. |
| **Privacy Premium** | Guardian+ users maintaining score for 3+ epochs receive pool distribution multiplier. |

# **18. Roadmap**

| Phase | Timeline | Deliverables |
| :---- | :---- | :---- |
| **Phase 1: Foundation** | Q2 2026 | Scoring program in TypeScript, Phala TEE deployment, SP1 proof worker integration, type script (RISC-V), score cell spec, registry cell on Pudge testnet. |
| **Phase 2: Dashboard** | Q3 2026 | Haven dashboard with CCC wallet connect, Twitter and GitHub OAuth into TEE, score visualization, leaderboard, deposit management, notification system, health monitoring. |
| **Phase 3: Platform** | Q3 2026 | Funding pools, Haven Passes, Shadow Job Board MVP. Testnet open. |
| **Phase 4: SDK** | Q3 2026 | Haven SDK with React hooks (useHavenScore, useHavenGate, useLeaderboard, useAuth, useDeposit, useNotifications). Full docs. First external dApp integrations. |
| **Phase 5: Mainnet** | Q4 2026 | Full mainnet launch. Governance. xUDT Haven Credits. SP1 program MPC ceremony. |
| **Phase 6: Ecosystem** | Q1 2027 | Additional data source integrations (LinkedIn, Discord, Telegram via modular connections). DAO live. RGB++ cross-chain score signals. |

# **19. Grant Positioning**

* First Phala TEE + SP1 verified application on CKB -- demonstrates production-grade confidential compute integrated with CKB's RISC-V proof verification.

* No traditional backend -- the TEE handles computation and on-chain settlement directly. A genuinely novel architecture for CKB.

* Public score, private identity -- a new privacy primitive that no other reputation system has shipped. The score is useful precisely because it is public, while the identity behind it is mathematically protected.

* Composable ecosystem infrastructure -- the Haven SDK makes reputation a public good any CKB dApp can use without any Haven dependency.

* Emerging markets focus -- pseudonymous reputation for users in Africa and other regions where privacy is a genuine need, not a preference.

* Credible technical team -- prior work: Groth16 implementation, shielded UTXO pool, ZK Mastermind game, Obscura and Sukura repos.

| Grant Narrative | Haven Protocol is the first system on CKB where a TEE computes reputation, SP1 proves it, and the chain verifies it -- with no backend, no trusted operator, and no way to fake a score. Public reputation. Private identity. Built on CKB. |
| :---: | :---- |

# **20. Security Considerations**

## **20.1 SP1 as Trust Anchor**

The system does not require trusting the Phala TEE hardware blindly. SP1 proves correct execution inside the TEE. An incorrect computation or tampered attestation produces an invalid SP1 proof, which the CKB type script rejects. The math is the trust.

## **20.2 TEE-Local PostgreSQL Storage**

Account linkages (OAuth tokens, wallet signatures) are stored in a PostgreSQL database running locally inside the Phala TEE container. The TEE hardware ensures that no external process can access this data -- not even the host operating system. Docker Compose co-locates the database with the TEE service, and data is persisted to a volume within the TEE's protected environment.

## **20.3 Program Hash Pinning**

The type script checks every SP1 proof against the current program hash in the Registry cell. Haven cannot silently change the scoring formula. Any update requires an on-chain Registry cell update via multisig, which is publicly visible.

## **20.4 Score Expiry**

Score cells have an expires_at field. Stale scores are rejected by the type script and SDK. Inactive users cannot hold high scores indefinitely.

## **20.5 Deposit Protection**

The dual-path lock script ensures the TEE update path cannot drain the user's deposit beyond the per-update fee. The type script enforces that deposit_balance decreases by exactly the per_update_fee on TEE updates. All other CKBytes require the user's private key.

## **20.6 Sybil Resistance**

Multiple wallets belonging to the same human are identified and deduplicated inside the TEE during computation using cross-platform consistency signals. The score reflects the human, not the wallet count.

## **20.7 Top-Up Safety**

The type script's `is_topup_only` check ensures that user top-up transactions can only increase the deposit balance. All other fields (score, epoch, identity, breakdown, timestamps) must remain identical. This prevents users from modifying their score through the top-up path.

# **21. Summary**

Haven Protocol on CKB is a privacy reputation system with a clean and honest architecture. The Haven Score is fully public -- on the leaderboard, readable by dApps, verifiable by anyone. The identity behind the score is fully private -- known only inside the Phala TEE, stored in a local PostgreSQL database that the TEE hardware protects.

There is no traditional backend. The Phala TEE collects activity, runs scoring every 5 minutes, requests SP1 proofs, and submits CKB transactions directly. The SP1 proof worker is stateless. The CKB type script is the final authority. If the proof does not verify, the score does not update.

Users connect their accounts once. Everything else is automatic. Scores update on a configurable schedule. Fees come from their pre-deposited CKBytes. They own their score cell and can always reclaim their CKBytes with their private key. The notification system keeps users informed of score changes, tier changes, and low balances.

The Haven SDK makes the score composable across CKB. dApps read scores directly from the chain. No Haven server. No API key. No central dependency. This is infrastructure -- built once, used by the entire privacy ecosystem on CKB.
