import express from 'express';
import cors from 'cors';
import { htlcRouter } from './routes/htlc.js';
import { swapRouter } from './routes/swap.js';
import { proofRouter } from './routes/proof.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'stealthswap-backend',
    network: 'bitcoin-testnet',
    timestamp: new Date().toISOString(),
    features: {
      realBtcTestnet: true,
      htlcSupport: true,
      zkProofs: true,
    },
  });
});

// API Documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'StealthSwap API',
    version: '1.0.0',
    description: 'Private BTC → Starknet Atomic Swap Backend (Real Bitcoin Testnet)',
    endpoints: {
      htlc: {
        'POST /api/htlc/wallet/generate': 'Generate new Bitcoin testnet wallet',
        'GET /api/htlc/wallet/:address/balance': 'Get wallet balance',
        'POST /api/htlc/create': 'Create HTLC with real testnet',
        'POST /api/htlc/:id/broadcast': 'Broadcast transaction',
        'POST /api/htlc/:id/claim': 'Claim with preimage',
        'POST /api/htlc/:id/refund': 'Refund after timelock',
      },
      swap: {
        'POST /api/swap/initiate': 'Initiate complete atomic swap',
        'POST /api/swap/:id/fund': 'Fund swap with BTC',
        'POST /api/swap/:id/link-starknet': 'Link Starknet swap',
        'POST /api/swap/:id/complete': 'Complete swap with preimage',
        'GET /api/swap/:id': 'Get swap details',
        'GET /api/swap': 'List all swaps',
      },
      proof: {
        'POST /api/proof/generate': 'Generate ZK amount proof',
        'POST /api/proof/verify': 'Verify commitment',
        'POST /api/proof/hashlock': 'Generate new hashlock',
        'POST /api/proof/starknet-proof': 'Complete Starknet proof package',
      },
    },
    faucet: 'https://coinfaucet.eu/en/btc-testnet/',
    explorer: 'https://blockstream.info/testnet/',
  });
});

// Routes
app.use('/api/htlc', htlcRouter);
app.use('/api/swap', swapRouter);
app.use('/api/proof', proofRouter);

app.listen(PORT, () => {
  console.log(`\n🔒 StealthSwap Backend running on port ${PORT}`);
  console.log(`🔗 Bitcoin Network: Testnet`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api`);
  console.log(`\n💰 Get testnet BTC: https://coinfaucet.eu/en/btc-testnet/\n`);
});

export default app;
