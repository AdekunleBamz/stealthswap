# StealthSwap 🔒

> Private BTC ↔ Starknet Atomic Swaps with STARK-friendly Cryptographic Commitments

[![Built for Starknet RE{DEFINE} Hackathon](https://img.shields.io/badge/Hackathon-RE%7BDEFINE%7D%202026-purple)](https://hackathon.starknet.org)
[![Track](https://img.shields.io/badge/Track-Bitcoin%20%2B%20Privacy-orange)](https://hackathon.starknet.org)

## 🎯 Overview

StealthSwap enables **privacy-preserving atomic swaps** between Bitcoin and Starknet. Using STARK-friendly cryptographic commitments (Poseidon hashes), we hide swap amounts and break the on-chain link between sender and receiver identities.

### Key Features

- 🔐 **Amount Privacy**: Swap amounts hidden via ZK commitments
- ⚡ **Atomic Swaps**: Trust-minimized HTLC-based exchanges
- 🕵️ **Identity Protection**: No direct on-chain address correlation
- 📊 **Privacy Scoring**: Real-time anonymity metrics
- 🎨 **Beautiful Dashboard**: Monitor swaps with live countdown timers

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

## 🎥 Demo Video

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

**Starknet Wallet Address**: *(to be added)*
