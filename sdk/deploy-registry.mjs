#!/usr/bin/env node
/**
 * Deploy a new Haven Registry cell with 171-byte data layout.
 * Consumes the old registry cell and creates a new one.
 */
import { ccc } from '@ckb-ccc/core';

const OLD_REGISTRY_TX = '0x31105ea4e11bc6172be31f2aa04dfbd8fea103a55c708bc7ce36389acceeb52c';
const OLD_REGISTRY_INDEX = 0;
const TEE_PRIVATE_KEY = process.env.TEE_SIGNING_KEY;
if (!TEE_PRIVATE_KEY) {
  console.error('Error: TEE_SIGNING_KEY environment variable is required');
  process.exit(1);
}

// Build the 171-byte registry data
function buildRegistryData() {
  const data = Buffer.alloc(171);
  // program_hash (32 bytes) - zeros
  // prev_program_hash (32 bytes) - zeros
  // epoch_duration = 10800
  data.writeUInt32LE(10800, 64);
  // min_deposit = 20000000000 (200 CKB)
  data.writeBigUInt64LE(20000000000n, 68);
  // per_update_fee = 300000000 (3 CKB)
  data.writeBigUInt64LE(300000000n, 76);
  // fee_address (32 bytes) - zeros
  // tier_observer = 0
  data.writeUInt16LE(0, 116);
  // tier_initiate = 200
  data.writeUInt16LE(200, 118);
  // tier_trusted = 400
  data.writeUInt16LE(400, 120);
  // tier_guardian = 650
  data.writeUInt16LE(650, 122);
  // tier_sovereign = 850
  data.writeUInt16LE(850, 124);
  // version = 1
  data[126] = 1;
  // grace_epochs = 2
  data.writeUInt32LE(2, 127);
  // low_balance_threshold = 1000000000 (10 CKB)
  data.writeBigUInt64LE(1000000000n, 131);
  // vk_hash (32 bytes) - zeros for now (updated after first proof)
  return '0x' + data.toString('hex');
}

async function main() {
  const client = new ccc.ClientPublicTestnet();
  const signer = new ccc.SignerCkbPrivateKey(client, TEE_PRIVATE_KEY);
  const addr = await signer.getRecommendedAddressObj();
  console.log('Deployer:', addr.toString());

  const registryDataHex = buildRegistryData();
  console.log('Registry data:', registryDataHex);
  console.log('Registry data length:', (registryDataHex.length - 2) / 2, 'bytes');

  // Build tx: consume old registry, create new one
  const tx = ccc.Transaction.from({
    inputs: [{
      previousOutput: { txHash: OLD_REGISTRY_TX, index: OLD_REGISTRY_INDEX },
    }],
    outputs: [{
      lock: addr.script,  // same TEE key lock
    }],
    outputsData: [registryDataHex],
  });

  // Add fee inputs and complete
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000);

  // Sign and send
  const txHash = await signer.sendTransaction(tx);
  console.log('Registry cell deployed:', txHash);
  console.log('Outpoint:', txHash + ':0');
}

main().catch(e => { console.error(e); process.exit(1); });
