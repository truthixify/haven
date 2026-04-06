export const config = {
  teeEndpoint: import.meta.env.VITE_TEE_ENDPOINT || 'http://localhost:3000/api',
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

  twitterClientId: import.meta.env.VITE_TWITTER_CLIENT_ID || '',
  githubClientId: import.meta.env.VITE_GITHUB_CLIENT_ID || '',
};
