//! Haven Protocol Type Script
//!
//! Validates all state transitions of Haven Score cells on CKB.
//!
//! Three modes:
//! 1. **Creation** (no input cell with this type): initial score=0, valid deposit.
//! 2. **Update** (input and output with this type): SP1 proof verification,
//!    public inputs matching, fee deduction, epoch increment.
//! 3. **Destruction** (input cell, no output cell): always allowed (user
//!    reclaiming CKBytes).

#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

use alloc::vec::Vec;
use ckb_std::{
    ckb_constants::Source,
    // ckb_types::bytes::Bytes, // no longer needed for SP1 verification
    high_level::{
        load_cell_data, load_cell_type_hash, load_script_hash,
        load_witness_args, QueryIter,
    },
};
use haven_types::{
    error, PublicInputs, RegistryCell, ScoreCell,
    CURRENT_VERSION, MAX_SCORE, PUBLIC_INPUTS_ACTUAL_SIZE, REGISTRY_CELL_ACTUAL_SIZE, 
    TEE_WITNESS_HEADER_SIZE,
};
use sp1_verifier::PlonkVerifier;

pub fn program_entry() -> i8 {
    match process() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

fn process() -> Result<(), i8> {
    let our_type_hash = load_script_hash().map_err(|_| error::INVALID_WITNESS)?;

    // Count input and output cells with this type script hash.
    let input_count = count_cells_by_type_hash(&our_type_hash, Source::Input);
    let output_count = count_cells_by_type_hash(&our_type_hash, Source::Output);

    match (input_count, output_count) {
        (0, 1) => handle_creation(),
        (1, 1) => {
            // Check if this is a TEE score update or a user top-up.
            // TEE updates have a witness with path flag 0x00 and SP1 proof.
            // User top-ups only change deposit_balance — no witness required.
            let input_data = load_input_score_cell_data()?;
            let output_data = load_output_score_cell_data()?;
            let input_cell = ScoreCell::from_bytes(&input_data)?;
            let output_cell = ScoreCell::from_bytes(&output_data)?;

            // If only deposit_balance changed (increased) and everything else
            // is identical, this is a user top-up — allow it without proof.
            if is_topup_only(&input_cell, &output_cell) {
                Ok(())
            } else {
                handle_update()
            }
        }
        (1, 0) => handle_destruction(),
        _ => Err(error::INVALID_DATA_LENGTH),
    }
}

// ---------------------------------------------------------------------------
// Creation: no input, one output
// ---------------------------------------------------------------------------

fn handle_creation() -> Result<(), i8> {
    let output_data = load_output_score_cell_data()?;
    let score_cell = ScoreCell::from_bytes(&output_data)?;

    // Initial score must be zero.
    if score_cell.score != 0 {
        return Err(error::INITIAL_SCORE_NOT_ZERO);
    }

    // Epoch must start at 0.
    if score_cell.epoch != 0 {
        return Err(error::INVALID_EPOCH);
    }

    // Breakdown must all be zero (sum = 0 = score).
    score_cell.validate_breakdown()?;

    // Load registry from cell deps to check minimum deposit.
    let registry = load_registry_from_deps()?;
    if score_cell.deposit_balance < registry.min_deposit {
        return Err(error::DEPOSIT_BELOW_MINIMUM);
    }

    // Version must be current.
    if score_cell.version != CURRENT_VERSION {
        return Err(error::UNSUPPORTED_VERSION);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Update: one input, one output (SP1 proof verification)
// ---------------------------------------------------------------------------

fn handle_update() -> Result<(), i8> {
    // Load input and output score cells.
    let input_data = load_input_score_cell_data()?;
    let output_data = load_output_score_cell_data()?;

    let input_cell = ScoreCell::from_bytes(&input_data)?;
    let output_cell = ScoreCell::from_bytes(&output_data)?;

    // Load the registry cell from cell deps.
    let registry = load_registry_from_deps()?;

    // Load witness data containing the SP1 proof.
    let witness = load_witness_for_type_script()?;

    if witness.len() < TEE_WITNESS_HEADER_SIZE {
        return Err(error::INVALID_WITNESS);
    }

    // Parse witness layout:
    // [0]                          = path flag (0x00 for TEE update)
    // [1..85]                      = public inputs (84 bytes)
    // [85..117]                    = vk_hash (32 bytes)
    // [117..121]                   = proof_len (u32 LE)
    // [121..121+proof_len]         = proof bytes
    // [121+proof_len..+4]          = journal_len (u32 LE)
    // [121+proof_len+4..]          = journal bytes (SP1 public values)
    let path_flag = witness[0];
    if path_flag != haven_types::PATH_TEE_UPDATE {
        return Err(error::INVALID_PATH_FLAG);
    }

    let pi_end = 1 + PUBLIC_INPUTS_ACTUAL_SIZE; // 85
    let vk_end = pi_end + 32;                   // 117
    let proof_len_end = vk_end + 4;             // 121

    let public_inputs_bytes = &witness[1..pi_end];
    let public_inputs = PublicInputs::from_bytes(public_inputs_bytes)?;

    let mut vk_hash = [0u8; 32];
    vk_hash.copy_from_slice(&witness[pi_end..vk_end]);

    let proof_len = u32::from_le_bytes([
        witness[vk_end], witness[vk_end + 1], witness[vk_end + 2], witness[vk_end + 3],
    ]) as usize;

    if witness.len() < proof_len_end + proof_len + 4 {
        return Err(error::INVALID_WITNESS);
    }

    let proof_bytes = &witness[proof_len_end..proof_len_end + proof_len];

    // Parse journal (SP1 public values)
    let journal_offset = proof_len_end + proof_len;
    let journal_len = u32::from_le_bytes([
        witness[journal_offset], witness[journal_offset + 1],
        witness[journal_offset + 2], witness[journal_offset + 3],
    ]) as usize;
    let journal_start = journal_offset + 4;

    if witness.len() < journal_start + journal_len {
        return Err(error::INVALID_WITNESS);
    }

    let journal_bytes = &witness[journal_start..journal_start + journal_len];

    // -----------------------------------------------------------------------
    // Validate public inputs against cell state
    // -----------------------------------------------------------------------

    // 1. User identity must not change.
    if !haven_types::ct_eq_32(&input_cell.user_identity, &output_cell.user_identity) {
        return Err(error::IDENTITY_CHANGED);
    }
    if !haven_types::ct_eq_32(&public_inputs.user_identity, &input_cell.user_identity) {
        return Err(error::PUBLIC_INPUTS_MISMATCH);
    }

    // 2. Previous score in proof must match input cell score.
    if public_inputs.prev_score != input_cell.score {
        return Err(error::PUBLIC_INPUTS_MISMATCH);
    }

    // 3. Previous epoch in proof must match input cell epoch.
    if public_inputs.prev_epoch != input_cell.epoch {
        return Err(error::PUBLIC_INPUTS_MISMATCH);
    }

    // 4. New score in proof must match output cell score.
    if public_inputs.new_score != output_cell.score {
        return Err(error::PUBLIC_INPUTS_MISMATCH);
    }

    // 5. Epoch must increment by exactly 1.
    if output_cell.epoch != input_cell.epoch + 1 {
        return Err(error::INVALID_EPOCH);
    }
    if public_inputs.epoch != output_cell.epoch {
        return Err(error::PUBLIC_INPUTS_MISMATCH);
    }

    // 6. New score must be in valid range.
    if output_cell.score > MAX_SCORE {
        return Err(error::SCORE_OUT_OF_RANGE);
    }

    // 7. Breakdown must match proof and sum to total.
    if output_cell.privacy_score != public_inputs.privacy_score
        || output_cell.contribution_score != public_inputs.contribution_score
        || output_cell.humanity_score != public_inputs.humanity_score
        || output_cell.community_score != public_inputs.community_score
    {
        return Err(error::PUBLIC_INPUTS_MISMATCH);
    }
    output_cell.validate_breakdown()?;
    public_inputs.validate()?;

    // 8. Program hash must match registry (current or previous for grace period).
    if !registry.is_valid_program_hash(&public_inputs.program_hash) {
        return Err(error::PROGRAM_HASH_MISMATCH);
    }

    // 9. Output cell program_hash must match the proof's program_hash.
    if !haven_types::ct_eq_32(&output_cell.program_hash, &public_inputs.program_hash) {
        return Err(error::PROGRAM_HASH_MISMATCH);
    }

    // 10. Deposit balance must decrease by exactly the per_update_fee.
    if input_cell.deposit_balance < registry.per_update_fee {
        return Err(error::INVALID_FEE_DEDUCTION);
    }
    let expected_balance = input_cell.deposit_balance - registry.per_update_fee;
    if output_cell.deposit_balance != expected_balance {
        return Err(error::INVALID_FEE_DEDUCTION);
    }

    // 11. Expires_at must be set to issued_at + epoch_duration.
    if output_cell.expires_at != output_cell.issued_at + registry.epoch_duration {
        return Err(error::INVALID_EXPIRY);
    }

    // 12. Version must remain current.
    if output_cell.version != CURRENT_VERSION {
        return Err(error::UNSUPPORTED_VERSION);
    }

    // -----------------------------------------------------------------------
    // SP1 PLONK proof verification
    // -----------------------------------------------------------------------

    // Convert vk_hash bytes to hex string WITH "0x" prefix for PlonkVerifier API
    let mut vk_hash_hex = [0u8; 66]; // "0x" + 64 hex chars
    vk_hash_hex[0] = b'0';
    vk_hash_hex[1] = b'x';
    for (i, byte) in vk_hash.iter().enumerate() {
        let hi = byte >> 4;
        let lo = byte & 0x0f;
        vk_hash_hex[2 + i * 2] = if hi < 10 { b'0' + hi } else { b'a' + hi - 10 };
        vk_hash_hex[2 + i * 2 + 1] = if lo < 10 { b'0' + lo } else { b'a' + lo - 10 };
    }
    let vk_hash_str = core::str::from_utf8(&vk_hash_hex).map_err(|_| error::VK_HASH_ENCODING_FAILED)?;

    // Verify the SP1 PLONK proof using the journal (SP1 public values).
    PlonkVerifier::verify(
        proof_bytes,
        journal_bytes,
        vk_hash_str,
        sp1_verifier::PLONK_VK_BYTES,
    )
    .map_err(|_| error::PROOF_VERIFICATION_FAILED)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Top-up check: only deposit_balance increased, everything else identical
// ---------------------------------------------------------------------------

fn is_topup_only(input: &ScoreCell, output: &ScoreCell) -> bool {
    // deposit_balance must increase (not decrease)
    if output.deposit_balance <= input.deposit_balance {
        return false;
    }
    // Everything else must be identical
    input.version == output.version
        && input.score == output.score
        && input.epoch == output.epoch
        && haven_types::ct_eq_32(&input.user_identity, &output.user_identity)
        && haven_types::ct_eq_32(&input.program_hash, &output.program_hash)
        && haven_types::ct_eq_32(&input.proof_hash, &output.proof_hash)
        && input.privacy_score == output.privacy_score
        && input.contribution_score == output.contribution_score
        && input.humanity_score == output.humanity_score
        && input.community_score == output.community_score
        && input.issued_at == output.issued_at
        && input.expires_at == output.expires_at
}

// ---------------------------------------------------------------------------
// Destruction: one input, no output -- always allowed
// ---------------------------------------------------------------------------

fn handle_destruction() -> Result<(), i8> {
    // User is reclaiming their CKBytes. No restrictions from the type script.
    // The lock script handles authorization.
    Ok(())
}

// ---------------------------------------------------------------------------
// Helper: count cells by type script hash
// ---------------------------------------------------------------------------

fn count_cells_by_type_hash(target_hash: &[u8; 32], source: Source) -> usize {
    let mut count = 0usize;
    for type_hash_opt in QueryIter::new(load_cell_type_hash, source) {
        if let Some(type_hash) = type_hash_opt {
            if type_hash == *target_hash {
                count += 1;
            }
        }
    }
    count
}

// ---------------------------------------------------------------------------
// Helper: find the index of our score cell in inputs/outputs
// ---------------------------------------------------------------------------

fn find_cell_index_by_type(source: Source) -> Result<usize, i8> {
    let our_hash = load_script_hash().map_err(|_| error::INVALID_WITNESS)?;

    for (i, type_hash_opt) in QueryIter::new(load_cell_type_hash, source).enumerate() {
        if let Some(type_hash) = type_hash_opt {
            if type_hash == our_hash {
                return Ok(i);
            }
        }
    }
    Err(error::INVALID_DATA_LENGTH)
}

fn load_input_score_cell_data() -> Result<Vec<u8>, i8> {
    let idx = find_cell_index_by_type(Source::Input)?;
    load_cell_data(idx, Source::Input).map_err(|_| error::INVALID_DATA_LENGTH)
}

fn load_output_score_cell_data() -> Result<Vec<u8>, i8> {
    let idx = find_cell_index_by_type(Source::Output)?;
    load_cell_data(idx, Source::Output).map_err(|_| error::INVALID_DATA_LENGTH)
}

// ---------------------------------------------------------------------------
// Helper: load registry cell from cell deps
// ---------------------------------------------------------------------------

/// The registry cell is identified by having data of exactly
/// REGISTRY_CELL_ACTUAL_SIZE bytes in the cell deps.
fn load_registry_from_deps() -> Result<RegistryCell, i8> {
    for i in 0.. {
        let data = match load_cell_data(i, Source::CellDep) {
            Ok(d) => d,
            Err(_) => break,
        };
        if data.len() == REGISTRY_CELL_ACTUAL_SIZE {
            return RegistryCell::from_bytes(&data);
        }
    }
    Err(error::REGISTRY_NOT_FOUND)
}

// ---------------------------------------------------------------------------
// Helper: load witness data for type script validation
// ---------------------------------------------------------------------------

/// Load the witness for the input cell matching our type script.
/// The SP1 proof and public inputs are stored in the `input_type` field
/// of the WitnessArgs.
fn load_witness_for_type_script() -> Result<Vec<u8>, i8> {
    let idx = find_cell_index_by_type(Source::Input)?;

    match load_witness_args(idx, Source::Input) {
        Ok(witness_args) => {
            // Primary: input_type field
            if let Some(input_type_data) = witness_args.input_type().to_opt() {
                let raw: Vec<u8> = input_type_data.raw_data().to_vec();
                if !raw.is_empty() {
                    return Ok(raw);
                }
            }
            // Fallback: lock field (for simpler transaction construction)
            if let Some(lock_data) = witness_args.lock().to_opt() {
                let raw: Vec<u8> = lock_data.raw_data().to_vec();
                if !raw.is_empty() {
                    return Ok(raw);
                }
            }
            Err(error::INVALID_WITNESS)
        }
        Err(_) => Err(error::INVALID_WITNESS),
    }
}
