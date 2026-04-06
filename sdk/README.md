# Haven Protocol SDK

TypeScript SDK for dApps to integrate Haven Protocol on CKB. Reads and verifies Haven Scores directly from the chain via CCC -- no Haven server required for on-chain reads.

**Package:** `@haven-protocol/ckb-sdk`

## Sub-path Exports

| Import path | Description |
|-------------|-------------|
| `@haven-protocol/ckb-sdk` | Core client, types, cell parser, constants, tiers, deposits |
| `@haven-protocol/ckb-sdk/tee` | TEE client for OAuth flows, identity registration, notifications |
| `@haven-protocol/ckb-sdk/react` | React hooks and HavenProvider |
| `@haven-protocol/ckb-sdk/contracts` | Script builders, cell builders, deploy info |
| `@haven-protocol/ckb-sdk/attestations` | Off-chain attestation generation |

## Core API -- HavenClient

All reads are pure on-chain. Wraps a CCC client instance.

```ts
import { ccc } from '@ckb-ccc/core';
import { HavenClient } from '@haven-protocol/ckb-sdk';

const client = new ccc.ClientPublicTestnet();
const haven = new HavenClient(client);

const score = await haven.getScore(lockHash);
const eligible = await haven.verifyThreshold(lockHash, 650);
const isGuardian = await haven.verifyTier(lockHash, 'Guardian');
const top100 = await haven.getLeaderboard(100);
const myScore = await haven.getMyScore(signer);
const attestation = await haven.generateScoreAttestation(lockHash, 500);
const registry = await haven.getRegistryConfig();
```

**Methods:**

- `getScore(lockHash)` -- fetch a user's Haven Score by lock script hash
- `getMyScore(signer)` -- fetch the connected wallet's score via CCC signer
- `verifyThreshold(lockHash, minScore)` -- check if score meets a minimum threshold
- `verifyTier(lockHash, tier)` -- check if score qualifies for a tier (Observer, Initiate, Trusted, Guardian, Sovereign)
- `getLeaderboard(limitOrOptions)` -- fetch sorted leaderboard (by score or any component, asc/desc)
- `generateScoreAttestation(lockHash, minScore)` -- generate an off-chain attestation
- `getScoreByIdentity(identityCommitment)` -- look up score by identity commitment
- `getAllScoreCells()` -- fetch all live score cells on-chain
- `getRegistryConfig()` -- fetch protocol configuration from the registry cell

## TEE Client -- HavenTeeClient

HTTP client for the Haven TEE service. Handles OAuth flows, identity registration, and notifications.

```ts
import { HavenTeeClient } from '@haven-protocol/ckb-sdk/tee';

const tee = new HavenTeeClient('http://localhost:3000/api');

const { identityCommitment } = await tee.registerIdentity(address, pubKey, signature, message);
const { identityCommitment } = await tee.getCommitment(pubKey);
const { registered } = await tee.checkIdentity(identityCommitment);
const status = await tee.getConnectionStatus(identityCommitment);
const health = await tee.getHealth();
const notifications = await tee.getNotifications(identityCommitment);
await tee.requestScoreRefresh(identityCommitment);
```

**OAuth flow:**

```ts
const twitterUrl = tee.getTwitterAuthUrl(callbackUrl);
await tee.completeTwitterAuth(identityCommitment, code, state);

const githubUrl = tee.getGithubAuthUrl(callbackUrl);
await tee.completeGithubAuth(identityCommitment, code, state);
```

## React Hooks

```tsx
import {
  HavenProvider,
  useHavenScore,
  useHavenGate,
  useLeaderboard,
  useAuth,
  useDeposit,
  useNotifications,
} from '@haven-protocol/ckb-sdk/react';
```

| Hook | Description |
|------|-------------|
| `useHavenScore` | Fetch and cache the connected wallet's Haven Score |
| `useHavenGate` | Gate access based on score threshold or tier |
| `useLeaderboard` | Fetch and paginate the public leaderboard |
| `useAuth` | Manage OAuth connection flows (Twitter, GitHub) |
| `useDeposit` | Build and submit deposit top-up transactions |
| `useNotifications` | Fetch and manage user notifications |

## Utilities

| Export | Description |
|--------|-------------|
| `parseScoreCell` / `serializeScoreCell` | Parse/serialize 127-byte score cell data |
| `parseRegistryCell` / `fetchRegistryConfig` | Parse/fetch 139-byte registry cell |
| `getTierDefinition` / `getAllTierDefinitions` | Tier metadata (name, threshold, color, description) |
| `getProgressToNextTier` | Calculate progress percentage to next tier |
| `formatScore` | Format numeric score for display |
| `truncateHash` | Truncate hex hashes for display |
| `estimateUpdatesRemaining` | Estimate how many scoring updates a deposit can fund |
| `isLowBalance` / `formatCkbAmount` | Deposit balance utilities |
| `createIdentityMessage` | Build the identity message for CKB wallet signing |
| `buildDepositTopUp` | Build a deposit top-up CKB transaction |
| `generateAttestation` / `generateSimpleAttestation` | Off-chain attestation generation |

## Install

```bash
npm install @haven-protocol/ckb-sdk
```

For local development alongside the monorepo:

```bash
npm install file:../sdk
```

## Build

```bash
npx tsc -p tsconfig.build.json
```

Watch mode:

```bash
npx tsc -p tsconfig.build.json --watch
```

## Dependencies

- `@ckb-ccc/core` (required)
- `react` >= 18 (optional peer dependency, only needed for `/react` sub-path)
