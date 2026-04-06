# Haven Protocol - SP1 Proof Worker
# This Dockerfile is at the repo root for Railway deployment
# It builds only the proof-worker component

FROM rust:1.93-bookworm AS builder

WORKDIR /app

# Copy proof-worker manifests for dependency caching
COPY proof-worker/Cargo.toml proof-worker/Cargo.lock ./

# Create dummy src to cache dependencies
RUN mkdir -p src && echo "fn main() {}" > src/main.rs
RUN cargo build --release || true

# Copy actual source
COPY proof-worker/src/ src/

# Build the real binary
RUN touch src/main.rs && cargo build --release

# Runtime image
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/proof-worker /app/proof-worker

ENV RUST_LOG=info
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["/app/proof-worker"]
