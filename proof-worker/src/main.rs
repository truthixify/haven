//! Haven Protocol — Proof Worker
//!
//! Stateless HTTP service that receives TDX attestation quotes from the Phala
//! TEE and generates SP1 DCAP proofs using Automata's verifier. The TEE then
//! includes the proof in a CKB score-update transaction.
//!
//! The proof worker has no database, no sessions, and no user data. It only
//! proves that a valid TDX attestation was produced.

mod prover;
mod routes;
mod types;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{routing::{get, post}, Router};
use tower_http::cors::CorsLayer;
use tracing::info;

const DEFAULT_PORT: u16 = 3001;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "proof_worker=info,tower_http=info".into()),
        )
        .init();

    // Initialize proof configuration from environment
    let proof_config = prover::ProofConfig::from_env();
    info!(
        proof_system = ?proof_config.proof_system,
        "DCAP proof config initialized"
    );

    let state = Arc::new(routes::AppState { proof_config });

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let app = Router::new()
        .route("/prove", post(routes::prove))
        .route("/health", get(routes::health))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(%addr, "Haven proof worker starting");
    info!("POST /prove   — generate SP1 DCAP proof from TDX attestation");
    info!("GET  /health  — health check");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind TCP listener");

    axum::serve(listener, app)
        .await
        .expect("server error");
}
