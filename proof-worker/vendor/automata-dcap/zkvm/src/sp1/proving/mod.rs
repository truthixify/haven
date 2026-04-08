use anyhow::{Context, Result};
use sp1_sdk::{prover::{Prover, ProveRequest}, SP1Stdin};

use super::config::ProofSystem;

/// Prove using SP1 prover (works with any Prover implementation)
pub async fn prove<P: Prover>(
    client: &P,
    pk: &P::ProvingKey,
    stdin: SP1Stdin,
    proof_system: ProofSystem,
) -> Result<(Vec<u8>, Vec<u8>)> {
    println!("Proof system: {:?}", proof_system);

    // Generate the proof using builder pattern
    let proof = match proof_system {
        ProofSystem::Groth16 => {
            client
                .prove(pk, stdin)
                .groth16()
                .await
                .map_err(|e| anyhow::anyhow!("{}", e))
                .context("SP1 Groth16 proving failed")?
        }
        ProofSystem::Plonk => {
            client
                .prove(pk, stdin)
                .plonk()
                .await
                .map_err(|e| anyhow::anyhow!("{}", e))
                .context("SP1 Plonk proving failed")?
        }
    };

    let journal = proof.public_values.to_vec();
    let proof_bytes = proof.bytes();

    Ok((journal, proof_bytes))
}
