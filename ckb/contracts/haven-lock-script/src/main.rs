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
//! The lock script dynamically loads the CKB system secp256k1 shared
//! library from a dep cell using `ckb_std::dynamic_loading_c_impl::CKBDLContext`.
//! It then calls the C functions to recover the public key from the
//! signature, Blake2b-160 hashes the result, and compares against the
//! expected pubkey hash stored in lock args.
//!
//! The transaction must include two system dep cells:
//!   1. The secp256k1 **code** cell (shared library ELF).
//!   2. The secp256k1 **data** cell (1 048 576 bytes precomputed tables).
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
    ckb_types::{core::ScriptHashType, prelude::*},
    high_level::{
        load_cell_data, load_input_since, load_script,
        load_tx_hash, load_witness, load_witness_args,
    },
};

// CKBDLContext is only available on the riscv64 target with dlopen-c feature.
#[cfg(target_arch = "riscv64")]
use ckb_std::dynamic_loading_c_impl::{CKBDLContext, Symbol};
use haven_types::{error, LOCK_ARGS_SIZE, PATH_TEE_UPDATE, PATH_USER_DIRECT, USER_WITNESS_SIZE};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNATURE_SIZE: usize = 65;
const HASH160_SIZE: usize = 20;
const UNCOMPRESSED_PUBKEY_SIZE: usize = 65;
const SECP256K1_DATA_SIZE: usize = 1_048_576;

/// Code hash (data hash) of the bundled secp256k1 code cell.
///
/// **IMPORTANT**: This must match the secp256k1 code cell deployed on
/// the target network (Pudge testnet or mainnet). The value below is a
/// placeholder. Replace it with the actual data hash before deployment.
///
/// On CKB mainnet (Lina), the well-known secp256k1 code cell data hash is:
///   0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8
///
/// On Pudge testnet it may differ. Check the genesis block cell info.
const SECP256K1_CODE_HASH: [u8; 32] = [
    0x9b, 0xd7, 0xe0, 0x6f, 0x3e, 0xcf, 0x4b, 0xe0,
    0xf2, 0xfc, 0xd2, 0x18, 0x8b, 0x23, 0xf1, 0xb9,
    0xfc, 0xc8, 0x8e, 0x5d, 0x4b, 0x65, 0xa8, 0x63,
    0x7b, 0x17, 0x72, 0x3b, 0xbd, 0xa3, 0xcc, 0xe8,
];

/// Size of the dynamic loading context buffer (must be page-aligned).
/// 512 KB is generous for the secp256k1 ELF.
const DL_CONTEXT_SIZE: usize = 512 * 1024;

// ---------------------------------------------------------------------------
// C function type definitions for the secp256k1 library
// ---------------------------------------------------------------------------

/// Signature for `ckb_secp256k1_custom_verify_only_initialize`.
/// Initializes the secp256k1 context using precomputed data.
type InitFn = unsafe extern "C" fn(
    context: *mut u8,       // secp256k1_context (opaque, ~200 bytes)
    precomputed_data: *const u8,  // 1 MB precomputed tables
);

/// Signature for `ckb_secp256k1_custom_recover`.
/// Recovers an uncompressed public key from a recoverable signature.
/// Returns 0 on success.
type RecoverFn = unsafe extern "C" fn(
    context: *const u8,     // secp256k1_context
    pubkey_output: *mut u8, // 65-byte uncompressed pubkey output
    signature: *const u8,   // 65-byte: [rec_id(1) | r(32) | s(32)]
    message: *const u8,     // 32-byte message hash
) -> i32;

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
// secp256k1 ECDSA verification via dynamic loading
// ---------------------------------------------------------------------------

/// Recover pubkey via dynamic-loaded secp256k1, Blake2b-160 hash, compare.
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

    let rec_id = sig[64];
    if rec_id > 3 {
        return Err(error::INVALID_SIGNATURE);
    }

    // Load the secp256k1 precomputed data from dep cells (1 MB).
    let secp_data = load_secp256k1_data()?;

    // Dynamically load the secp256k1 code cell.
    let mut context: CKBDLContext<[u8; DL_CONTEXT_SIZE]> = unsafe { CKBDLContext::new() };
    let lib = context
        .load_by(&SECP256K1_CODE_HASH, ScriptHashType::Data)
        .map_err(|_| error::INVALID_SIGNATURE)?;

    // Look up the C functions.
    let init_fn: Symbol<InitFn> = unsafe { lib.get(b"ckb_secp256k1_custom_verify_only_initialize") }
        .ok_or(error::INVALID_SIGNATURE)?;
    let recover_fn: Symbol<RecoverFn> = unsafe { lib.get(b"ckb_secp256k1_custom_recover") }
        .ok_or(error::INVALID_SIGNATURE)?;

    // Initialize the secp256k1 context with the precomputed data.
    // The C context struct is opaque; 1024 bytes is more than enough.
    let mut secp_ctx = [0u8; 1024];
    unsafe {
        (*init_fn)(secp_ctx.as_mut_ptr(), secp_data.as_ptr());
    }

    // Build the C-ABI signature: [rec_id (1) | r (32) | s (32)]
    let mut sig_c = [0u8; SIGNATURE_SIZE];
    sig_c[0] = rec_id;
    sig_c[1..33].copy_from_slice(&sig[0..32]);
    sig_c[33..65].copy_from_slice(&sig[32..64]);

    // Recover the uncompressed public key.
    let mut pubkey = [0u8; UNCOMPRESSED_PUBKEY_SIZE];
    let ret = unsafe {
        (*recover_fn)(
            secp_ctx.as_ptr(),
            pubkey.as_mut_ptr(),
            sig_c.as_ptr(),
            msg.as_ptr(),
        )
    };
    if ret != 0 {
        return Err(error::INVALID_SIGNATURE);
    }

    // Blake2b-160 of the recovered pubkey.
    let hash = blake2b_160(&pubkey);

    // Constant-time comparison.
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

/// Load the secp256k1 precomputed data (1 048 576 bytes) from cell deps.
fn load_secp256k1_data() -> Result<Vec<u8>, i8> {
    for i in 0.. {
        match load_cell_data(i, Source::CellDep) {
            Ok(data) => {
                if data.len() == SECP256K1_DATA_SIZE {
                    return Ok(data);
                }
            }
            Err(_) => break,
        }
    }
    Err(error::INVALID_SIGNATURE)
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
            // This output uses our lock. Check it has a type script.
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
