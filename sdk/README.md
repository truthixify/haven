# Haven Protocol SDK

TypeScript SDK for dApps to integrate Haven Protocol on CKB. Reads and verifies Haven Scores directly from the chain via CCC, with no Haven server required for on-chain reads.

**Package:** `@haven-protocol-ckb/sdk`

## Install

```bash
npm install @haven-protocol-ckb/sdk
```

## Sub-path Exports

| Import path | Description |
|-------------|-------------|
| `@haven-protocol-ckb/sdk` | Core client, types, cell parser, constants, tiers, deposits |
| `@haven-protocol-ckb/sdk/tee` | TEE client for OAuth flows, identity registration, score history, notifications |
| `@haven-protocol-ckb/sdk/react` | React hooks and HavenProvider |
| `@haven-protocol-ckb/sdk/contracts` | Script builders, cell builders, deploy info |
| `@haven-protocol-ckb/sdk/attestations` | Off-chain attestation generation |

## Core API: HavenClient

All reads are pure on-chain. Wraps a CCC client instance.

```ts
import { ccc } from '@ckb-ccc/core';
import { HavenClient } from '@haven-protocol-ckb/sdk';

const client = new ccc.ClientPublicTestnet();
const haven = new HavenClient(client, {
  typeScriptCodeHash: '0x134e98b0...',
  typeScriptHashType: 'type',
});

const score = await haven.getScore(lockHash);
const eligible = await haven.verifyThreshold(lockHash, 650);
const isGuardian = await haven.verifyTier(lockHash, 'Guardian');
const top100 = await haven.getLeaderboard(100);
const myScore = await haven.getMyScore(signer);
const registry = await haven.getRegistryConfig();
```

**Methods:**

- `getScore(lockHash)` - fetch a user's Haven Score by lock script hash
- `getMyScore(signer)` - fetch the connected wallet's score via CCC signer
- `verifyThreshold(lockHash, minScore)` - check if score meets a minimum threshold
- `verifyTier(lockHash, tier)` - check if score qualifies for a tier
- `getLeaderboard(limitOrOptions)` - fetch sorted leaderboard (by score or any component)
- `getRegistryConfig()` - fetch protocol configuration from the registry cell
- `getAllScoreCells()` - fetch all live score cells on-chain

## TEE Client: HavenTeeClient

HTTP client for the Haven TEE service. Handles OAuth flows, identity registration, score history, and notifications.

```ts
import { HavenTeeClient } from '@haven-protocol-ckb/sdk/tee';

const tee = new HavenTeeClient('https://your-tee-endpoint/api');

// Identity
const { identityCommitment } = await tee.registerIdentity(address, pubKey, signature, message);
const { registered } = await tee.checkIdentity(identityCommitment);

// Connections (Twitter, GitHub, Discord, LinkedIn)
const status = await tee.getConnectionStatus(identityCommitment);
// { wallet: true, twitter: false, github: true, discord: true, linkedin: false }

// Score
await tee.requestScoreRefresh(identityCommitment);
const history = await tee.getScoreHistory(identityCommitment);

// Health
const health = await tee.getHealth();

// Notifications
const notifications = await tee.getNotifications(identityCommitment);
await tee.markNotificationRead(id);

// Score cell
await tee.saveScoreCellOutpoint(identityCommitment, txHash, index);
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
} from '@haven-protocol-ckb/sdk/react';

// Wrap your app
<HavenProvider
  client={cccClient}
  options={{ typeScriptCodeHash: '0x134e98b0...' }}
>
  <App />
</HavenProvider>
```

| Hook | Description |
|------|-------------|
| `useHavenScore` | Fetch and cache the connected wallet's Haven Score |
| `useHavenGate` | Gate access based on score threshold or tier |
| `useLeaderboard` | Fetch and paginate the public leaderboard |
| `useAuth` | Manage OAuth connection flows |
| `useDeposit` | Build and submit deposit top-up transactions |
| `useNotifications` | Fetch and manage user notifications |

## Score Tiers

| Tier | Range |
|------|-------|
| Observer | 0-199 |
| Initiate | 200-399 |
| Trusted | 400-649 |
| Guardian | 650-849 |
| Sovereign | 850-1000 |

## Utilities

| Export | Description |
|--------|-------------|
| `parseScoreCell` / `serializeScoreCell` | Parse/serialize 127-byte score cell data |
| `getTierForScore` / `getTierDefinition` | Tier lookup and metadata |
| `getProgressToNextTier` | Progress percentage to next tier |
| `formatScore` / `truncateHash` | Display formatting |
| `estimateUpdatesRemaining` | Estimate scoring updates a deposit can fund |
| `isLowBalance` / `formatCkbAmount` | Deposit balance utilities |

## Build

```bash
npm run build    # tsc -p tsconfig.build.json
npm run dev      # watch mode
```

## CI/CD

The SDK auto-publishes on push to `sdk/**` on `main`. The CI bumps the patch version and publishes to npm.
