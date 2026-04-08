//! Haven DCAP SP1 Guest Program (v6)
//!
//! Runs inside the SP1 zkVM. Verifies a TDX DCAP attestation quote
//! using dcap-rs and commits the verification result as public values.
//!
//! Input: ABI-encoded (bytes collateral, bytes quote, uint64 timestamp)
//! Output: VerifiedOutput + timestamp + 6 collateral hashes (keccak256)

#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::{sol, SolType};
use dcap_rs::types::collateral::Collateral;
use dcap_rs::types::quote::Quote;
use der::Encode;
use std::time::{Duration, UNIX_EPOCH};
use tiny_keccak::{Hasher, Keccak};

/// Solidity ABI type for v1.1 input
type GuestInputSolType = sol!((bytes, bytes, uint64));

pub fn main() {
    // Read the input bytes from the host
    let input_bytes = sp1_zkvm::io::read_vec();

    // Decode ABI-encoded input: (collateral_encoded, quote_bytes, timestamp)
    let decoded = GuestInputSolType::abi_decode_params(&input_bytes)
        .expect("Failed to ABI-decode guest input");

    let collateral_encoded: Vec<u8> = decoded.0.into();
    let quote_bytes: Vec<u8> = decoded.1.into();
    let timestamp = decoded.2;

    // Parse the collateral from its ABI-encoded form
    let collateral = Collateral::sol_abi_decode(&collateral_encoded)
        .expect("Failed to decode collateral");

    // Parse the quote
    let mut quote_slice = quote_bytes.as_slice();
    let quote = Quote::read(&mut quote_slice)
        .expect("Failed to parse quote");

    // Build SystemTime from timestamp
    let current_time = UNIX_EPOCH + Duration::from_secs(timestamp);

    // Verify the DCAP attestation
    let verified_output = dcap_rs::verify_dcap_quote(current_time, collateral, quote)
        .expect("DCAP verification failed");

    // Serialize the VerifiedOutput
    let output_bytes = verified_output.to_vec();

    // Re-decode collateral for hashing (verify_dcap_quote consumed it)
    let collateral2 = Collateral::sol_abi_decode(&collateral_encoded)
        .expect("Failed to re-decode collateral");

    // Compute keccak256 hashes of collateral components
    let tcbinfo_json = serde_json::to_vec(&collateral2.tcb_info).unwrap_or_default();
    let qe_identity_json = serde_json::to_vec(&collateral2.qe_identity).unwrap_or_default();
    let root_cert_der = collateral2.tcb_info_and_qe_identity_issuer_chain
        .get(0).and_then(|c| c.to_der().ok()).unwrap_or_default();
    let signing_cert_der = collateral2.tcb_info_and_qe_identity_issuer_chain
        .get(1).and_then(|c| c.to_der().ok()).unwrap_or_default();
    let root_crl_der = collateral2.root_ca_crl.to_der().unwrap_or_default();
    let pck_crl_der = collateral2.pck_crl.to_der().unwrap_or_default();

    let tcbinfo_hash = keccak256(&tcbinfo_json);
    let qe_identity_hash = keccak256(&qe_identity_json);
    let root_cert_hash = keccak256(&root_cert_der);
    let signing_cert_hash = keccak256(&signing_cert_der);
    let root_crl_hash = keccak256(&root_crl_der);
    let pck_crl_hash = keccak256(&pck_crl_der);

    // Build the journal output:
    // 2 bytes BE: output_len
    // [output_len]: VerifiedOutput bytes
    // 8 bytes BE: timestamp
    // 6 x 32 bytes: collateral hashes
    let output_len = output_bytes.len() as u16;
    let mut journal = Vec::new();
    journal.extend_from_slice(&output_len.to_be_bytes());
    journal.extend_from_slice(&output_bytes);
    journal.extend_from_slice(&timestamp.to_be_bytes());
    journal.extend_from_slice(&tcbinfo_hash);
    journal.extend_from_slice(&qe_identity_hash);
    journal.extend_from_slice(&root_cert_hash);
    journal.extend_from_slice(&signing_cert_hash);
    journal.extend_from_slice(&root_crl_hash);
    journal.extend_from_slice(&pck_crl_hash);

    // Commit the journal as public values
    sp1_zkvm::io::commit_slice(&journal);
}

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(data);
    hasher.finalize(&mut output);
    output
}
