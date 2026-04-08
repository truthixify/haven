//! Haven Protocol Lock Script
//!
//! Dual-path lock script for Haven Score cells.
//!
//! **Path 1 (TEE Update, witness flag 0x00)**
//! The Phala TEE submits a score update. Lock script verifies:
//!   - TEE signature on the sighash-all message.
//!   - At least one output cell with our lock also carries a type script,
//!     guaranteeing the Haven type script validates the SP1 proof.
//!
//! **Path 2 (User Direct, witness flag 0x01)**
//! Standard secp256k1 signature check. User can unlock for top-ups,
//! migration, or cell closure.
//!
//! Lock args (40 bytes):
//!   `[0..20]  user_pubkey_hash` -- Blake2b-160 of user secp256k1 pubkey
//!   `[20..40] tee_pubkey_hash`  -- Blake2b-160 of TEE secp256k1 pubkey
//!
//! ## secp256k1 verification
//!
//! Uses the `k256` crate (pure Rust, no_std) for ECDSA pubkey recovery.
//! No dynamic loading or external dep cells required.
//!
//! ## Witness layout (WitnessArgs.lock)
//!
//! | Byte(s) | TEE path (0x00)       | User path (0x01)      |
//! |---------|-----------------------|-----------------------|
//! | 0       | 0x00 (path flag)      | 0x01 (path flag)      |
//! | 1..66   | TEE signature (65 B)  | User signature (65 B) |

#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

use alloc::vec;
use alloc::vec::Vec;
use ckb_std::{
    ckb_constants::Source,
    ckb_types::prelude::*,
    high_level::{
        load_input_since, load_script,
        load_tx_hash, load_witness, load_witness_args,
    },
};
use haven_types::{error, LOCK_ARGS_SIZE, PATH_TEE_UPDATE, PATH_USER_DIRECT, USER_WITNESS_SIZE};
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNATURE_SIZE: usize = 65;
const HASH160_SIZE: usize = 20;

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

pub fn program_entry() -> i8 {
    match process() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

fn process() -> Result<(), i8> {
    let script = load_script().map_err(|_| error::INVALID_LOCK_ARGS)?;
    let args: Vec<u8> = script.args().raw_data().to_vec();

    if args.len() != LOCK_ARGS_SIZE {
        return Err(error::INVALID_LOCK_ARGS);
    }

    let mut user_pubkey_hash = [0u8; HASH160_SIZE];
    user_pubkey_hash.copy_from_slice(&args[0..20]);

    let mut tee_pubkey_hash = [0u8; HASH160_SIZE];
    tee_pubkey_hash.copy_from_slice(&args[20..40]);

    let witness = load_lock_witness()?;
    let path_flag = haven_types::parse_path_flag(&witness)?;

    match path_flag {
        PATH_TEE_UPDATE => handle_tee_path(&tee_pubkey_hash, &witness),
        PATH_USER_DIRECT => handle_user_path(&user_pubkey_hash, &witness),
        _ => Err(error::INVALID_PATH_FLAG),
    }
}

// ---------------------------------------------------------------------------
// Path 1 -- TEE Update
// ---------------------------------------------------------------------------

fn handle_tee_path(tee_hash: &[u8; HASH160_SIZE], witness: &[u8]) -> Result<(), i8> {
    verify_type_script_on_output()?;

    if witness.len() < 1 + SIGNATURE_SIZE {
        return Err(error::INVALID_WITNESS);
    }

    let sig = &witness[1..1 + SIGNATURE_SIZE];
    let msg = build_sighash_all_message(witness.len())?;
    verify_secp256k1_blake160(&msg, sig, tee_hash)
}

// ---------------------------------------------------------------------------
// Path 2 -- User Direct
// ---------------------------------------------------------------------------

fn handle_user_path(user_hash: &[u8; HASH160_SIZE], witness: &[u8]) -> Result<(), i8> {
    if witness.len() < USER_WITNESS_SIZE {
        return Err(error::INVALID_WITNESS);
    }

    let sig = &witness[1..1 + SIGNATURE_SIZE];
    let msg = build_sighash_all_message(witness.len())?;
    verify_secp256k1_blake160(&msg, sig, user_hash)
}

// ---------------------------------------------------------------------------
// sighash-all message hash
// ---------------------------------------------------------------------------

fn build_sighash_all_message(lock_field_len: usize) -> Result<[u8; 32], i8> {
    let tx_hash = load_tx_hash().map_err(|_| error::INVALID_SIGNATURE)?;

    let mut blake = new_blake2b();
    blake.update(&tx_hash);

    // First witness in lock group -- zero the lock field.
    let wa = load_witness_args(0, Source::GroupInput).map_err(|_| error::INVALID_WITNESS)?;
    let zero_lock = vec![0u8; lock_field_len];

    use ckb_std::ckb_types::packed;
    let zeroed_lock = packed::BytesOpt::new_builder()
        .set(Some(
            packed::Bytes::new_builder()
                .set(zero_lock.iter().map(|b| packed::Byte::new(*b)).collect())
                .build(),
        ))
        .build();

    let zeroed_wa = wa.as_builder().lock(zeroed_lock).build();
    let zeroed_bytes = zeroed_wa.as_bytes();
    let len = zeroed_bytes.len() as u64;
    blake.update(&len.to_le_bytes());
    blake.update(&zeroed_bytes);

    // Remaining group witnesses.
    let mut idx = 1usize;
    loop {
        match load_witness(idx, Source::GroupInput) {
            Ok(wb) => {
                let wl = wb.len() as u64;
                blake.update(&wl.to_le_bytes());
                blake.update(&wb);
                idx += 1;
            }
            Err(_) => break,
        }
    }

    // Extra witnesses beyond input count.
    let ic = count_inputs();
    let mut ei = ic;
    loop {
        match load_witness(ei, Source::Input) {
            Ok(wb) => {
                let wl = wb.len() as u64;
                blake.update(&wl.to_le_bytes());
                blake.update(&wb);
                ei += 1;
            }
            Err(_) => break,
        }
    }

    let mut hash = [0u8; 32];
    blake.finalize(&mut hash);
    Ok(hash)
}

// ---------------------------------------------------------------------------
// secp256k1 ECDSA verification via k256 (pure Rust)
// ---------------------------------------------------------------------------

/// Recover pubkey via k256, compress, Blake2b-160 hash, compare.
///
/// Signature format: `r (32) || s (32) || recovery_id (1)`.
fn verify_secp256k1_blake160(
    msg: &[u8; 32],
    sig: &[u8],
    expected: &[u8; HASH160_SIZE],
) -> Result<(), i8> {
    if sig.len() != SIGNATURE_SIZE {
        return Err(error::INVALID_SIGNATURE);
    }

    // Parse the 64-byte compact signature (r || s)
    let signature = Signature::from_slice(&sig[..64])
        .map_err(|_| error::INVALID_SIGNATURE)?;

    // Parse recovery id (0-3)
    let recid = RecoveryId::from_byte(sig[64])
        .ok_or(error::INVALID_SIGNATURE)?;

    // Recover the public key from the prehashed message
    let recovered_key = VerifyingKey::recover_from_prehash(msg.as_slice(), &signature, recid)
        .map_err(|_| error::SECP_RECOVER_FAILED)?;

    // Get compressed public key (33 bytes: 02/03 || x)
    let encoded = recovered_key.to_encoded_point(true);
    let compressed = encoded.as_bytes();

    // Blake2b-160 of compressed pubkey
    let hash = blake2b_160(compressed);

    // Constant-time comparison
    let mut diff: u8 = 0;
    let mut i = 0;
    while i < HASH160_SIZE {
        diff |= hash[i] ^ expected[i];
        i += 1;
    }
    if diff != 0 {
        return Err(error::INVALID_SIGNATURE);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Blake2b helpers
// ---------------------------------------------------------------------------

fn new_blake2b() -> ckb_hash::Blake2b {
    ckb_hash::new_blake2b()
}

fn blake2b_160(data: &[u8]) -> [u8; HASH160_SIZE] {
    let mut h = new_blake2b();
    h.update(data);
    let mut full = [0u8; 32];
    h.finalize(&mut full);
    let mut out = [0u8; HASH160_SIZE];
    out.copy_from_slice(&full[..HASH160_SIZE]);
    out
}

// ---------------------------------------------------------------------------
// Cell / witness helpers
// ---------------------------------------------------------------------------

/// At least one output sharing our lock must also have a type script.
fn verify_type_script_on_output() -> Result<(), i8> {
    use ckb_std::high_level::{load_cell_lock_hash, load_cell_type_hash, load_script_hash};

    let our_lock_hash = load_script_hash().map_err(|_| error::TYPE_SCRIPT_MISSING)?;

    for i in 0.. {
        let out_lock_hash = match load_cell_lock_hash(i, Source::Output) {
            Ok(h) => h,
            Err(_) => break,
        };
        if out_lock_hash == our_lock_hash {
            match load_cell_type_hash(i, Source::Output) {
                Ok(Some(_)) => return Ok(()),
                _ => return Err(error::TYPE_SCRIPT_MISSING),
            }
        }
    }
    Err(error::TYPE_SCRIPT_MISSING)
}

fn count_inputs() -> usize {
    let mut c = 0usize;
    loop {
        match load_input_since(c, Source::Input) {
            Ok(_) => c += 1,
            Err(_) => return c,
        }
    }
}

fn load_lock_witness() -> Result<Vec<u8>, i8> {
    match load_witness_args(0, Source::GroupInput) {
        Ok(wa) => match wa.lock().to_opt() {
            Some(lock) => {
                let raw: Vec<u8> = lock.raw_data().to_vec();
                if raw.is_empty() {
                    Err(error::INVALID_WITNESS)
                } else {
                    Ok(raw)
                }
            }
            None => Err(error::INVALID_WITNESS),
        },
        Err(_) => Err(error::INVALID_WITNESS),
    }
}
