use std::sync::Arc;

use axum::{extract::State, http::StatusCode, Json};
use tracing::{error, info, warn};

use crate::prover::{self, ProofConfig};
use crate::types::{ErrorResponse, HealthResponse, ProveRequest, ProveResponse};

/// Maximum valid Haven Score.
const MAX_SCORE: u16 = 1000;

/// Expected byte length for program_hash and user_identity (32 bytes = 64 hex chars).
const HASH_BYTE_LEN: usize = 32;

/// Shared application state.
pub struct AppState {
    pub proof_config: ProofConfig,
}

// ---------------------------------------------------------------------------
// POST /prove
// ---------------------------------------------------------------------------

/// Handle a prove request from the Phala TEE.
///
/// Receives a hex-encoded TDX attestation quote, generates an SP1 DCAP
/// proof via Automata's verifier, and returns the proof bytes + public values.
pub async fn prove(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ProveRequest>,
) -> Result<Json<ProveResponse>, (StatusCode, Json<ErrorResponse>)> {
    info!(
        epoch = req.public_inputs.epoch,
        prev_score = req.public_inputs.prev_score,
        new_score = req.public_inputs.new_score,
        "Received prove request"
    );

    // -----------------------------------------------------------------------
    // Validate attestation quote
    // -----------------------------------------------------------------------
    // Quote is hex-encoded from dstack getQuote()
    let clean_quote = req.attestation_quote.trim().trim_start_matches("0x");
    let quote_bytes = hex::decode(clean_quote).map_err(|e| {
        warn!(error = %e, "Invalid attestation_quote hex");
        bad_request(format!("attestation_quote is not valid hex: {e}"))
    })?;

    if quote_bytes.is_empty() {
        warn!("Empty attestation quote");
        return Err(bad_request("attestation_quote must not be empty".into()));
    }

    // -----------------------------------------------------------------------
    // Validate public inputs
    // -----------------------------------------------------------------------
    validate_hex_field(
        &req.public_inputs.program_hash,
        HASH_BYTE_LEN,
        "program_hash",
    )?;
    validate_hex_field(
        &req.public_inputs.user_identity,
        HASH_BYTE_LEN,
        "user_identity",
    )?;

    if req.public_inputs.prev_score > MAX_SCORE {
        return Err(bad_request(format!(
            "prev_score must be 0..={MAX_SCORE}, got {}",
            req.public_inputs.prev_score
        )));
    }
    if req.public_inputs.new_score > MAX_SCORE {
        return Err(bad_request(format!(
            "new_score must be 0..={MAX_SCORE}, got {}",
            req.public_inputs.new_score
        )));
    }
    if req.public_inputs.privacy_score > MAX_SCORE {
        return Err(bad_request(format!(
            "privacy_score must be 0..={MAX_SCORE}, got {}",
            req.public_inputs.privacy_score
        )));
    }
    if req.public_inputs.contribution_score > MAX_SCORE {
        return Err(bad_request(format!(
            "contribution_score must be 0..={MAX_SCORE}, got {}",
            req.public_inputs.contribution_score
        )));
    }
    if req.public_inputs.humanity_score > MAX_SCORE {
        return Err(bad_request(format!(
            "humanity_score must be 0..={MAX_SCORE}, got {}",
            req.public_inputs.humanity_score
        )));
    }
    if req.public_inputs.community_score > MAX_SCORE {
        return Err(bad_request(format!(
            "community_score must be 0..={MAX_SCORE}, got {}",
            req.public_inputs.community_score
        )));
    }

    // prev_epoch must be strictly less than epoch (or both zero for first update).
    if req.public_inputs.prev_epoch >= req.public_inputs.epoch
        && req.public_inputs.epoch != 0
    {
        return Err(bad_request(format!(
            "prev_epoch ({}) must be less than epoch ({})",
            req.public_inputs.prev_epoch, req.public_inputs.epoch
        )));
    }

    // -----------------------------------------------------------------------
    // Generate DCAP proof via Automata SP1 verifier
    // -----------------------------------------------------------------------
    info!(quote_size = quote_bytes.len(), "Generating DCAP proof...");

    let output = prover::generate_proof(&quote_bytes, &state.proof_config)
        .await
        .map_err(|e| {
            error!(error = %e, "Proof generation failed");
            internal_error(format!("proof generation failed: {e}"))
        })?;

    info!(
        proof_size = output.proof_bytes.len(),
        journal_size = output.public_values.len(),
        proof_hash = hex::encode(&output.proof_hash),
        program_id = %output.program_id,
        vk_hash = %output.vk_hash,
        "DCAP proof generated"
    );

    Ok(Json(ProveResponse {
        proof: hex::encode(&output.proof_bytes),
        public_values: hex::encode(&output.public_values),
        proof_hash: hex::encode(&output.proof_hash),
        program_id: output.program_id,
        vk_hash: output.vk_hash,
    }))
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

pub async fn health(
    State(state): State<Arc<AppState>>,
) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        version: "0.1.0".into(),
        proof_system: format!("{:?}", state.proof_config.proof_system),
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_hex_field(
    value: &str,
    expected_len: usize,
    field_name: &str,
) -> Result<(), (StatusCode, Json<ErrorResponse>)> {
    let bytes = hex::decode(value).map_err(|e| {
        warn!(field = field_name, error = %e, "Invalid hex");
        bad_request(format!("{field_name} is not valid hex: {e}"))
    })?;

    if bytes.len() != expected_len {
        return Err(bad_request(format!(
            "{field_name} must be exactly {expected_len} bytes, got {}",
            bytes.len()
        )));
    }

    Ok(())
}

fn bad_request(message: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse { error: message }),
    )
}

fn internal_error(message: String) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse { error: message }),
    )
}
