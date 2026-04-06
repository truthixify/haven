/**
 * Haven TEE Service - Configuration
 *
 * All sensitive values come from environment variables.
 * In production, these are injected by the Phala TEE runtime.
 */

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),

  ckb: {
    network: process.env.CKB_NETWORK || 'testnet',
    rpcUrl: process.env.CKB_RPC_URL || 'https://testnet.ckb.dev/rpc',
    indexerUrl: process.env.CKB_INDEXER_URL || 'https://testnet.ckb.dev/indexer',
    teeSigningKey: process.env.TEE_SIGNING_KEY || '',
  },

  dstack: {
    // Optional: override dstack endpoint. Leave empty for production socket.
    endpoint: process.env.DSTACK_ENDPOINT || '',
  },

  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME || 'haven',
    user: process.env.DATABASE_USER || 'haven',
    password: process.env.DATABASE_PASSWORD || 'haven_tee_secret',
  },

  twitter: {
    clientId: process.env.TWITTER_CLIENT_ID || '',
    clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
    callbackUrl:
      process.env.TWITTER_CALLBACK_URL ||
      'http://localhost:3000/auth/twitter/callback',
  },

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL ||
      'http://localhost:3000/auth/github/callback',
  },

  proofWorker: {
    url: process.env.PROOF_WORKER_URL || 'http://localhost:3001',
  },

  haven: {
    registryTxHash: process.env.HAVEN_REGISTRY_TX_HASH || '',
    registryIndex: parseInt(process.env.HAVEN_REGISTRY_INDEX || '0', 10),
    typeScriptCodeHash: process.env.HAVEN_TYPE_SCRIPT_CODE_HASH || '',
    typeScriptHashType: process.env.HAVEN_TYPE_SCRIPT_HASH_TYPE || 'type',
  },

  scoring: {
    cron: process.env.SCORING_CRON || '*/5 * * * *',
  },
});
