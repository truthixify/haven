# Haven Dashboard

React web application for interacting with Haven Protocol. Connects to CKB wallets via CCC, fetches scores and leaderboard data from the chain using the Haven SDK, and manages identity connections through the TEE service.

## Tech Stack

- **Build:** Vite 6, TypeScript
- **UI:** React 18, Tailwind CSS 3, Lucide React icons
- **Wallet:** @ckb-ccc/connector-react
- **Data:** @haven-protocol/ckb-sdk (on-chain reads + TEE client)
- **Routing:** react-router-dom v6

## Design System

"The Mathematical Monolith," an obsidian dark theme.

- **Fonts:** Space Grotesk (headlines), Inter (body/labels), JetBrains Mono (monospace)
- **Sovereign Purple:** `#d0bcff` (primary)
- **Cyber Teal:** `#44e2cd` (secondary)
- **Amber Accent:** `#ffb869` (tertiary)
- **Background:** `#121315` (surface)

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Haven Score display, score breakdown, deposit balance, score history chart |
| `/identity` | Identity | Connect CKB wallet, link Twitter/GitHub accounts, connection status |
| `/leaderboard` | Leaderboard | Public leaderboard sorted by score or component, with tier badges |
| `/ecosystem` | Ecosystem | Shadow Job Board and ecosystem integrations |

## Features

- CCC wallet connect with custom wallet profile popover
- Notification panel (score updates, connection events)
- Action loading overlay for async operations
- Score history chart
- All data fetched via `@haven-protocol/ckb-sdk` (on-chain reads) and `@haven-protocol/ckb-sdk/tee` (TEE interactions)

## Setup

```bash
npm install
```

## Environment Variables

Create a `.env` file or set these variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_TEE_ENDPOINT` | Haven TEE service URL | `http://localhost:3000/api` |
| `VITE_CKB_NETWORK` | CKB network | `testnet` |
| `VITE_CKB_RPC_URL` | CKB RPC URL | `https://testnet.ckb.dev/rpc` |
| `VITE_HAVEN_TYPE_SCRIPT_CODE_HASH` | Haven type script code hash | `0x1193537c...` |
| `VITE_HAVEN_TYPE_SCRIPT_HASH_TYPE` | Hash type | `type` |
| `VITE_HAVEN_TYPE_SCRIPT_CELLDEP_TX_HASH` | Type script cell dep tx hash | `0xdec5fba8...` |
| `VITE_HAVEN_TYPE_SCRIPT_CELLDEP_INDEX` | Type script cell dep index | `0` |
| `VITE_HAVEN_REGISTRY_CELLDEP_TX_HASH` | Registry cell dep tx hash | `0x31105ea4...` |
| `VITE_HAVEN_REGISTRY_CELLDEP_INDEX` | Registry cell dep index | `0` |
| `VITE_TWITTER_CLIENT_ID` | Twitter OAuth client ID (for initiating OAuth from dashboard) | N/A |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth client ID | N/A |

## Run

Development server:

```bash
npx vite --host
```

The dashboard runs on port **5173** by default.

Production build:

```bash
npm run build
npx vite preview
```
