export const config = {
  teeEndpoint: import.meta.env.VITE_TEE_ENDPOINT || 'https://cd60c10b43ffe88796261dccc3305d975feb71ce-3000.dstack-pha-prod9.phala.network/api',
  ckbNetwork: import.meta.env.VITE_CKB_NETWORK || 'testnet',
  ckbRpcUrl: import.meta.env.VITE_CKB_RPC_URL || 'https://testnet.ckb.dev/rpc',

  // Haven Type Script — deployed on CKB testnet
  havenTypeScriptCodeHash:
    import.meta.env.VITE_HAVEN_TYPE_SCRIPT_CODE_HASH ||
    '0x134e98b02554060a248e337f63eb5a6136c379f41afad9f4bc023c0f3b52d715',
  havenTypeScriptHashType:
    (import.meta.env.VITE_HAVEN_TYPE_SCRIPT_HASH_TYPE as 'type' | 'data' | 'data1' | 'data2') ||
    'type',

  // Cell dep for the Haven Type Script (the cell that contains the script binary)
  havenTypeScriptCellDepTxHash:
    import.meta.env.VITE_HAVEN_TYPE_SCRIPT_CELLDEP_TX_HASH ||
    '0x57b2ba0d60380373b8aaa11172110662bbef67a1041b5f71aca7872753ba7586',
  havenTypeScriptCellDepIndex:
    Number(import.meta.env.VITE_HAVEN_TYPE_SCRIPT_CELLDEP_INDEX || '0'),

  // Haven Registry Cell (contains protocol config: min deposit, fees, tier thresholds)
  havenRegistryCellDepTxHash:
    import.meta.env.VITE_HAVEN_REGISTRY_CELLDEP_TX_HASH ||
    '0xb52181cb5dfa075501f3710d096dc0285fced72afc46a69694b1458c28117980',
  havenRegistryCellDepIndex:
    Number(import.meta.env.VITE_HAVEN_REGISTRY_CELLDEP_INDEX || '0'),

  // Haven Lock Script — dual-path lock (TEE update + user direct)
  havenLockScriptCodeHash:
    import.meta.env.VITE_HAVEN_LOCK_SCRIPT_CODE_HASH ||
    '0x296b392e89ec260d8ddc81c3ade5f18bb1d9775f6f9a3885c0ea1fd81d11cf18',
  havenLockScriptHashType:
    (import.meta.env.VITE_HAVEN_LOCK_SCRIPT_HASH_TYPE as 'type' | 'data') || 'type',
  havenLockScriptCellDepTxHash:
    import.meta.env.VITE_HAVEN_LOCK_SCRIPT_CELLDEP_TX_HASH ||
    '0x0f5b013a8266850af4ede958467987b07bc22b5874296eabdb1fcc8022ec1998',
  havenLockScriptCellDepIndex:
    Number(import.meta.env.VITE_HAVEN_LOCK_SCRIPT_CELLDEP_INDEX || '0'),

  // TEE pubkey hash (blake160) — the TEE wallet that can update scores via Path 1
  teePubkeyHash:
    import.meta.env.VITE_TEE_PUBKEY_HASH ||
    '0xd16644dd1d4ca1d59887126136aa11f41738f1c5',

  twitterClientId: import.meta.env.VITE_TWITTER_CLIENT_ID || '',
  githubClientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
  discordClientId: import.meta.env.VITE_DISCORD_CLIENT_ID || '',
  linkedinClientId: import.meta.env.VITE_LINKEDIN_CLIENT_ID || '',
};
