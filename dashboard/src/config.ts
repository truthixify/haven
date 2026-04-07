export const config = {
  teeEndpoint: import.meta.env.VITE_TEE_ENDPOINT || 'https://cd60c10b43ffe88796261dccc3305d975feb71ce-3000.dstack-pha-prod9.phala.network/api',
  ckbNetwork: import.meta.env.VITE_CKB_NETWORK || 'testnet',
  ckbRpcUrl: import.meta.env.VITE_CKB_RPC_URL || 'https://testnet.ckb.dev/rpc',

  // Haven Type Script — deployed on CKB testnet
  havenTypeScriptCodeHash:
    import.meta.env.VITE_HAVEN_TYPE_SCRIPT_CODE_HASH ||
    '0x1193537cffa570e905d47ce971a166720e07773f188bce6a1dafd2740e892a37',
  havenTypeScriptHashType:
    (import.meta.env.VITE_HAVEN_TYPE_SCRIPT_HASH_TYPE as 'type' | 'data' | 'data1' | 'data2') ||
    'type',

  // Cell dep for the Haven Type Script (the cell that contains the script binary)
  havenTypeScriptCellDepTxHash:
    import.meta.env.VITE_HAVEN_TYPE_SCRIPT_CELLDEP_TX_HASH ||
    '0xdec5fba84ef56bcb3ee9f2db791183a7bfe8187dd462e8919a35348d4970448c',
  havenTypeScriptCellDepIndex:
    Number(import.meta.env.VITE_HAVEN_TYPE_SCRIPT_CELLDEP_INDEX || '0'),

  // Haven Registry Cell (contains protocol config: min deposit, fees, tier thresholds)
  havenRegistryCellDepTxHash:
    import.meta.env.VITE_HAVEN_REGISTRY_CELLDEP_TX_HASH ||
    '0x31105ea4e11bc6172be31f2aa04dfbd8fea103a55c708bc7ce36389acceeb52c',
  havenRegistryCellDepIndex:
    Number(import.meta.env.VITE_HAVEN_REGISTRY_CELLDEP_INDEX || '0'),

  // Haven Lock Script — dual-path lock (TEE update + user direct)
  havenLockScriptCodeHash:
    import.meta.env.VITE_HAVEN_LOCK_SCRIPT_CODE_HASH ||
    '0x80cb3b10f5f2e9e4a034447be9240d0357e39cbde2e21b3a045d9f72739d4da5',
  havenLockScriptHashType:
    (import.meta.env.VITE_HAVEN_LOCK_SCRIPT_HASH_TYPE as 'type' | 'data') || 'type',
  havenLockScriptCellDepTxHash:
    import.meta.env.VITE_HAVEN_LOCK_SCRIPT_CELLDEP_TX_HASH ||
    '0xe64d45b1ab83232793ca142c52b30c5ee4c52a045b0fd46645b66367ca412e76',
  havenLockScriptCellDepIndex:
    Number(import.meta.env.VITE_HAVEN_LOCK_SCRIPT_CELLDEP_INDEX || '0'),

  // TEE pubkey hash (blake160) — the TEE wallet that can update scores via Path 1
  teePubkeyHash:
    import.meta.env.VITE_TEE_PUBKEY_HASH ||
    '0xd16644dd1d4ca1d59887126136aa11f41738f1c5',

  twitterClientId: import.meta.env.VITE_TWITTER_CLIENT_ID || '',
  githubClientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
};
