use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Top-level prove request sent by the Phala TEE.
#[derive(Debug, Deserialize)]
pub struct ProveRequest {
    /// Base64-encoded TDX attestation quote from the Phala TEE (via dstack getQuote).
    pub attestation_quote: String,

    /// Haven-specific public inputs that accompany the proof.
    /// These are committed alongside the DCAP verification output.
    pub public_inputs: PublicInputs,
}

/// Haven-specific public inputs. The CKB type script verifies these
/// against the on-chain score cell state (84 bytes when serialized).
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PublicInputs {
    /// SP1 scoring program hash — 32 bytes, hex-encoded.
    pub program_hash: String,

    /// Blake2b hash of the user's CKB public key — 32 bytes, hex-encoded.
    pub user_identity: String,

    /// Previous Haven Score (0..=1000).
    pub prev_score: u16,

    /// New Haven Score computed by the TEE (0..=1000).
    pub new_score: u16,

    /// Score epoch number. Monotonically increasing per user.
    pub epoch: u32,

    /// Privacy Hygiene sub-score (0..=1000).
    pub privacy_score: u16,

    /// Ecosystem Contribution sub-score (0..=1000).
    pub contribution_score: u16,

    /// Proof of Human sub-score (0..=1000).
    pub humanity_score: u16,

    /// Community Engagement sub-score (0..=1000).
    pub community_score: u16,

    /// Previous epoch number from the input score cell.
    pub prev_epoch: u32,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Successful proof response returned to the TEE.
#[derive(Debug, Serialize)]
pub struct ProveResponse {
    /// Base64-encoded SP1 proof bytes.
    pub proof: String,

    /// Base64-encoded public values / journal from the zkVM.
    pub public_values: String,

    /// Blake2b hash of the proof bytes, hex-encoded.
    pub proof_hash: String,

    /// SP1 program identifier for the DCAP verifier.
    pub program_id: String,

    /// SP1 verification key hash, hex-encoded (32 bytes).
    pub vk_hash: String,
}

/// Health check response.
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub proof_system: String,
}

/// JSON error body returned on 4xx/5xx responses.
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}
