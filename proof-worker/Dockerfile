# Haven Protocol - SP1 Proof Worker
# Note: Railway builds from repo root with dockerfilePath = "proof-worker/Dockerfile"

FROM rust:1.93-bookworm AS builder

RUN apt-get update && apt-get install -y protobuf-compiler && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything at once (vendor + source + manifests)
COPY proof-worker/ .

# Build
RUN cargo build --release

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
