//! DCAP attestation proof generation using Automata's SP1 zkVM verifier.
//!
//! Generates zero-knowledge proofs for TDX attestation verification.
//! The proof verifies the full TDX quote including:
//! - Quote signature chain
//! - Intel certificate chain validation
//! - TCB (Trusted Computing Base) status
//! - Collateral freshness

use alloy::providers::ProviderBuilder;
use automata_dcap_utils::Version;
use automata_dcap_zkvm::{
    prepare_guest_input,
    sp1::{Sp1Config, Sp1Prover, ProofSystem},
    ZkVmProver,
};
use blake2b_rs::Blake2bBuilder;
use tracing::info;

/// Output from DCAP proof generation.
#[derive(Debug)]
pub struct ProofOutput {
    /// The ZK proof bytes (Groth16 or Plonk).
    pub proof_bytes: Vec<u8>,
    /// The public values / journal from the zkVM.
    pub public_values: Vec<u8>,
    /// Blake2b hash of the proof bytes.
    pub proof_hash: Vec<u8>,
    /// SP1 program identifier.
    pub program_id: String,
    /// SP1 verification key hash (32 bytes, hex-encoded).
    /// This is the same as the program identifier — the hash of the
    /// verification key used by the on-chain PLONK verifier.
    pub vk_hash: String,
}

/// Configuration for DCAP proof generation.
#[derive(Debug, Clone)]
pub struct ProofConfig {
    /// SP1 Network private key for remote proving.
    pub sp1_private_key: String,
    /// Proof system to use (Plonk for CKB on-chain verification).
    pub proof_system: ProofSystem,
    /// RPC URL for fetching collaterals from on-chain PCCS.
    pub rpc_url: String,
}

impl ProofConfig {
    pub fn from_env() -> Self {
        Self {
            sp1_private_key: std::env::var("SP1_PRIVATE_KEY")
                .or_else(|_| std::env::var("SP1_NETWORK_PRIVATE_KEY"))
                .expect("SP1_PRIVATE_KEY or SP1_NETWORK_PRIVATE_KEY required"),
            proof_system: match std::env::var("DCAP_PROOF_SYSTEM")
                .unwrap_or_else(|_| "plonk".to_string())
                .to_lowercase()
                .as_str()
            {
                "groth16" => ProofSystem::Groth16,
                _ => ProofSystem::Plonk,
            },
            rpc_url: std::env::var("AUTOMATA_RPC_URL")
                .or_else(|_| std::env::var("RPC_URL"))
                .expect("AUTOMATA_RPC_URL or RPC_URL required for collateral fetching"),
        }
    }
}

/// Generate a DCAP attestation proof using Automata's SP1 verifier.
///
/// Takes the raw TDX quote bytes, fetches collaterals from on-chain PCCS,
/// and generates an SP1 proof of correct attestation verification.
pub async fn generate_proof(
    tdx_quote: &[u8],
    config: &ProofConfig,
) -> anyhow::Result<ProofOutput> {
    info!("Initializing Automata DCAP SP1 prover");

    // Check quote version — strip simulator header if present.
    // The dstack simulator prepends a 4-byte header (0x0000 + 2 bytes) before the
    // actual TDX quote. If the first 2 bytes aren't a valid version (3/4/5),
    // check if a valid version exists at offset 4 and strip the header.
    let quote = if tdx_quote.len() >= 6 {
        let version_at_0 = u16::from_le_bytes([tdx_quote[0], tdx_quote[1]]);
        let version_at_4 = u16::from_le_bytes([tdx_quote[4], tdx_quote[5]]);
        if !(3..=5).contains(&version_at_0) && (3..=5).contains(&version_at_4) {
            info!(
                "Stripping 4-byte simulator header (version at offset 0: {}, at offset 4: {})",
                version_at_0, version_at_4
            );
            &tdx_quote[4..]
        } else {
            tdx_quote
        }
    } else {
        tdx_quote
    };

    info!("Quote size: {} bytes, version: {}", quote.len(),
        u16::from_le_bytes([quote[0], quote[1]]));

    // DCAP v1.1 supports TDX v4/v5 quotes
    let version = Version::V1_1;

    // Create provider for fetching collaterals from on-chain PCCS
    info!(rpc_url = %config.rpc_url, "Connecting to RPC for collateral fetching");
    let provider = ProviderBuilder::new().connect(&config.rpc_url).await?;

    // Prepare guest input (fetches collaterals from on-chain PCCS)
    info!("Fetching DCAP collaterals from on-chain PCCS...");
    let input_bytes = prepare_guest_input(
        &provider,
        Some(version),
        quote,
        None,
    )
    .await?;

    info!(input_size = input_bytes.len(), "Guest input prepared");

    // Create SP1 prover with Automata's pre-built DCAP verifier ELF
    let prover = Sp1Prover::new(version)?;
    let program_id = prover.program_identifier()?;

    info!(
        program_id = %program_id,
        circuit_version = %Sp1Prover::circuit_version(),
        "SP1 DCAP prover initialized"
    );

    // Configure SP1 proving
    let sp1_config = Sp1Config {
        proof_system: config.proof_system,
        private_key: config.sp1_private_key.clone(),
        rpc_url: Some(config.rpc_url.clone()),
    };

    // Generate proof via SP1 Network
    info!(
        proof_system = ?config.proof_system,
        "Generating DCAP proof via SP1 Network (this may take several minutes)..."
    );

    let (journal, proof) = prover.prove(&sp1_config, &input_bytes).await?;

    info!(
        journal_size = journal.len(),
        proof_size = proof.len(),
        "DCAP proof generated successfully"
    );

    // Compute Blake2b hash of the proof for on-chain reference
    let proof_hash = blake2b_hash(&proof);

    // The SP1 program identifier is the hash of the verification key,
    // which is what the on-chain PLONK verifier uses as vk_hash.
    let vk_hash = program_id.clone();

    Ok(ProofOutput {
        proof_bytes: proof,
        public_values: journal,
        proof_hash: proof_hash.to_vec(),
        program_id,
        vk_hash,
    })
}

/// Compute a 32-byte Blake2b hash with Haven Protocol personalization.
fn blake2b_hash(data: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2bBuilder::new(32)
        .personal(b"haven-protocol00")
        .build();
    hasher.update(data);
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}
