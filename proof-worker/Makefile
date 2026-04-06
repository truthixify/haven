# Haven Protocol — Proof Worker Makefile
# Generates DCAP attestation proofs using Automata's SP1 zkVM verifier

.PHONY: all build run run-debug test clean setup env check fmt lint help

all: build

setup: ## Install SP1 toolchain
	@echo "Installing SP1 toolchain..."
	curl -L https://sp1up.dev | bash
	~/.sp1/bin/sp1up
	@echo "SP1 toolchain installed"

env: ## Create .env from example
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file — edit with your values"; \
	else \
		echo ".env already exists"; \
	fi

build: ## Build the proof worker binary
	@echo "Building proof worker..."
	cargo build --release
	@echo "Binary at: target/release/proof-worker"

run: ## Run the proof worker
	RUST_LOG=info ./target/release/proof-worker

run-debug: ## Run with debug logging
	RUST_LOG=debug cargo run

test: ## Run tests
	cargo test

clean: ## Clean build artifacts
	cargo clean

check: ## Run cargo check
	cargo check

fmt: ## Format code
	cargo fmt

lint: ## Run clippy
	cargo clippy -- -D warnings

help: ## Show this help
	@echo "Haven Proof Worker — DCAP Attestation Proof Generation"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
