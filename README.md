# StealthSwap 🔒

> Private BTC ↔ Starknet Atomic Swaps with STARK-friendly Cryptographic Commitments

[![Built for Starknet RE{DEFINE} Hackathon](https://img.shields.io/badge/Hackathon-RE%7BDEFINE%7D%202026-purple)](https://hackathon.starknet.org)
[![Track](https://img.shields.io/badge/Track-Bitcoin%20%2B%20Privacy-orange)](https://hackathon.starknet.org)

## 🎯 Overview

StealthSwap enables **privacy-preserving atomic swaps** between Bitcoin and Starknet. Using STARK-friendly cryptographic commitments (Poseidon hashes), we hide swap amounts and break the on-chain link between sender and receiver identities.

### Why Starknet?

Starknet's STARK-based execution enables scalable, quantum-safe verification of privacy commitments without trusted setup — making it uniquely suited for Bitcoin-integrated privacy applications. Cairo's native support for Poseidon hashes allows efficient on-chain commitment verification.

### Key Features

- 🔐 **Amount Privacy**: Swap amounts hidden via ZK commitments
- ⚡ **Atomic Swaps**: Trust-minimized HTLC-based exchanges
- 🕵️ **Identity Protection**: No direct on-chain address correlation
- 📊 **Privacy Scoring**: Real-time anonymity metrics
- 🎨 **Beautiful Dashboard**: Monitor swaps with live countdown timers

## 🚦 Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Bitcoin HTLC | ✅ Complete | Real atomic swap scripts with OP_CHECKLOCKTIMEVERIFY |
| Amount Commitments | ✅ Complete | Poseidon hash-based privacy layer |
| Bitcoin Testnet | ✅ Complete | Real HTLC transactions via Blockstream API |
| Starknet Deployment | ✅ Complete | Live on Sepolia ([verified contract](https://sepolia.voyager.online/contract/0x058acc5b4ef9d1c65f5672f2174f01c62bd9bdc318e99d093d4b3ca71b56bdfc)) |
| Privacy Scoring | ✅ Complete | Heuristic-based anonymity metrics |
| Cross-Chain Relayer | ✅ Complete | Backend coordinates preimage revelation |
| Token Transfers | 🚧 Coordinated | Backend-managed (future: on-chain ERC20) |
| Full STARK Proofs | 🚧 Foundation | Commitment structure ready for proof integration |
| Decentralized Relayer | 📋 Planned | Currently centralized coordinator |

**Legend**: ✅ Production-ready | 🚧 Working foundation | 📋 Future roadmap

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        StealthSwap                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   React UI   │◄──►│   Backend    │◄──►│    Cairo     │      │
│  │  Dashboard   │    │  BTC Testnet │    │   Contracts  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Wallet     │    │  Real HTLC   │    │   ZK Proof   │      │
│  │  Connection  │    │  (bitcoinjs) │    │  Verification│      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                                   │
│                             ▼                                   │
│                      ┌──────────────┐                          │
│                      │  Blockstream │                          │
│                      │  Testnet API │                          │
│                      └──────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- [Scarb](https://docs.swmansion.com/scarb/) (Cairo package manager)
- [Starkli](https://github.com/xJonathanLEI/starkli) (Starknet CLI)
- A Starknet wallet (Argent X or Braavos)

### Installation

```bash
# Clone the repository
git clone https://github.com/AdekunleBamz/stealthswap.git
cd stealthswap

# Install all dependencies
npm install

# Start development servers
npm run dev
```

### Building Contracts

```bash
cd contracts
scarb build
```

### Deploying to Starknet Testnet

```bash
# Set up your account
starkli signer keystore new ~/.starkli-wallets/keystore.json
starkli account oz init ~/.starkli-wallets/account.json

# Deploy the contract
starkli deploy ./target/dev/stealthswap_StealthSwap.contract_class.json \
  --account ~/.starkli-wallets/account.json \
  --keystore ~/.starkli-wallets/keystore.json
```

#### ✅ Latest Sepolia Deployment (2026-02-04)

- **Class Hash**: `0x0244d48a8c0a2dc7e12bd2de28e20a29af350676ef299489f4d8b8f892cf7f31`
- **Contract Address**: `0x058acc5b4ef9d1c65f5672f2174f01c62bd9bdc318e99d093d4b3ca71b56bdfc`
- **Deploy Tx**: `0x05ac55ca9e6764949ef4c52c856267d9cf8c8d863cdce1c371c459a22169e8e2`

## 📁 Project Structure

```
stealthswap/
├── contracts/              # Cairo smart contracts
│   ├── src/
│   │   ├── lib.cairo       # Module exports
│   │   ├── swap.cairo      # Main swap contract
│   │   ├── verifier.cairo  # Commitment verification logic
│   │   └── types.cairo     # Shared types
│   └── Scarb.toml
│
├── backend/                # Real BTC Testnet HTLC service
│   ├── src/
│   │   ├── index.ts        # Express server
│   │   ├── types.ts        # TypeScript types
│   │   ├── routes/         # API routes
│   │   └── services/       # Bitcoin testnet (bitcoinjs-lib)
│   └── package.json
│
├── frontend/               # React dashboard
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── store/          # Zustand state
│   │   ├── utils/          # Helper functions
│   │   └── types/          # TypeScript types
│   └── package.json
│
└── README.md
```

## 🔧 How It Works

### 1. Swap Initiation
User creates a swap request specifying:
- BTC amount (hidden via ZK commitment)
- Starknet recipient address
- Timelock duration

### 2. BTC HTLC Creation
A Hash Time-Locked Contract is created on Bitcoin Testnet:
- Real HTLC scripts using bitcoinjs-lib
- Funds locked with SHA256 hashlock
- Block-height based timelock via OP_CHECKLOCKTIMEVERIFY
- Broadcast to real Bitcoin testnet via Blockstream API

### 3. Starknet Contract Lock
The Starknet contract verifies:
- ZK proof of amount commitment
- Hashlock matches BTC HTLC
- Participant addresses

### 4. Swap Completion
Revealing the preimage:
- Completes the Starknet swap
- Allows BTC HTLC redemption
- Privacy maintained throughout

## 📊 Privacy Features

| Feature | Description |
|---------|-------------|
| **Amount Commitment** | Pedersen-style hash hides actual BTC amount |
| **Nullifiers** | Prevent replay attacks and double-spending |
| **Timelock Variance** | Non-standard durations resist timing analysis |
| **No Direct Links** | Hashlock is only on-chain correlation |

### Privacy Score Calculation

The dashboard displays a real-time privacy score (0-100) based on:

- **Timelock Duration** (+30 pts max): Longer timelocks increase anonymity set
- **Amount Entropy** (+30 pts max): Non-round amounts resist pattern matching
- **Timing Variance** (+20 pts max): Random delays reduce correlation risk
- **Network Activity** (+20 pts max): Higher overall volume improves privacy

The scoring is heuristic-based, designed to guide users toward privacy-optimal choices.

## 🔍 Privacy Model & Limitations

**StealthSwap protects against:**
- ✅ Swap amount disclosure (hidden via commitments)
- ✅ Direct on-chain address correlation between BTC and Starknet
- ✅ Replay attacks (nullifier-based prevention)

**Does NOT yet protect against:**
- ⚠️ Network-level observers (IP correlation)
- ⚠️ Backend operator correlation (centralized coordinator)
- ⚠️ Advanced timing analysis (swap initiation patterns)

**Cross-chain hash compatibility:**
Due to Bitcoin's SHA256 and Starknet's Poseidon hash differences, StealthSwap currently relies on a relayer model to propagate preimage revelations across chains. The backend service observes Bitcoin preimage revelation and submits the corresponding Starknet preimage. Future versions will explore unified hash primitives or ZK-based hash adapters.

**Future roadmap:**
- Fully client-side proof generation
- Decentralized relayer network
- Multi-hop privacy routing
- Tor/mixnet integration
- Unified cross-chain hash primitives

## 🧪 Testing

```bash
# Run Cairo tests
cd contracts
scarb test

# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test
```

## 📡 API Endpoints

### Swap Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/swap/initiate` | Create new swap |
| GET | `/api/swap/:id` | Get swap details |
| GET | `/api/swap` | List all swaps |
| POST | `/api/swap/:id/link-starknet` | Link Starknet swap |

### HTLC Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/htlc/create` | Create BTC HTLC |
| POST | `/api/htlc/:id/lock` | Lock HTLC |
| POST | `/api/htlc/:id/complete` | Complete with preimage |
| GET | `/api/htlc/generate/preimage` | Generate preimage + hashlock |

### Proof Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/proof/generate` | Generate amount proof |
| POST | `/api/proof/verify` | Verify proof |

## � Live Demo Evidence

### Starknet Sepolia Transactions

| Type | Transaction | Status |
|------|-------------|--------|
| Complete Swap | [`0x07df2c00...`](https://sepolia.voyager.online/tx/0x07df2c00a0eb1d5f511148c7a407cc4789ab8aa96a40b911f41df7d2a3a605f2) | ✅ Accepted on L2 |
| Contract | [`0x058acc5b...`](https://sepolia.voyager.online/contract/0x058acc5b4ef9d1c65f5672f2174f01c62bd9bdc318e99d093d4b3ca71b56bdfc) | ✅ Verified on Sepolia |

You can verify these transactions on the Starknet Sepolia explorer!

## �🎥 Demo Video

[Watch the 3-minute demo](https://youtu.be/your-demo-link)

## 🏆 Hackathon Submission

**Track**: Bitcoin + Privacy

**What We Built**:
- Cairo smart contracts for atomic swaps with cryptographic commitment verification
- Bitcoin Testnet HTLC transactions generated and broadcast via Blockstream API
- React dashboard with real-time swap monitoring
- Privacy scoring system

**Why It Matters**:
- Privacy is the institutional priority for 2026
- Starknet's quantum-safe ZK tech is perfect for private swaps
- Real infrastructure that can be extended to mainnet

## 🛠️ Tech Stack

- **Smart Contracts**: Cairo (Starknet)
- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, Vite, TailwindCSS, Zustand
- **Cryptography**: Poseidon hash commitments (STARK-friendly, designed for future full proof integration)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🤝 Team

Built with 💜 for the Starknet RE{DEFINE} Hackathon 2026

---

**Starknet Wallet Address**: `0x01c047c74eC56B8B6AD34893029f37AcaB9ac24574f2DB5fC4819B581935E507`
