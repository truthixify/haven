# Haven Protocol - SP1 Proof Worker
# Build: docker build -t haven-proof-worker .
# Run: docker run --env-file .env haven-proof-worker

FROM rust:1.83-bookworm AS builder

WORKDIR /app

# Copy manifests first for dependency caching
COPY Cargo.toml Cargo.lock ./

# Create dummy src to cache dependencies
RUN mkdir -p src && echo "fn main() {}" > src/main.rs
RUN cargo build --release || true

# Copy actual source
COPY src/ src/

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
