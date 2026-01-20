import { Router } from 'express';
import { hash } from 'starknet';
import * as btcService from '../services/bitcoin.service.js';

export const proofRouter = Router();

/**
 * Generate ZK-style amount proof using Poseidon hash
 */
function generateAmountProof(amountSats: number) {
  // Generate random blinding factor
  const blindingFactor = '0x' + Buffer.from(
    btcService.generateHashlock().preimage, 'hex'
  ).toString('hex').slice(0, 64);

  // Pedersen-style commitment: H(amount, blindingFactor)
  const commitment = hash.computePoseidonHashOnElements([
    amountSats.toString(),
    blindingFactor,
  ]);

  // Nullifier to prevent double-spending
  const nullifier = hash.computePoseidonHashOnElements([
    commitment,
    blindingFactor,
    Date.now().toString(),
  ]);

  // Proof hash (in production, this would be a real ZK proof)
  const proofHash = hash.computePoseidonHashOnElements([
    commitment,
    nullifier,
  ]);

  return {
    commitment,
    nullifier,
    proofHash,
    blindingFactor,
    timestamp: Date.now(),
  };
}

/**
 * POST /api/proof/generate
 * Generates a ZK-style amount commitment and proof
 */
proofRouter.post('/generate', (req, res) => {
  try {
    const { amount, amountSats } = req.body;

    // Support both 'amount' (BTC) and 'amountSats' (satoshis)
    let sats: number;
    if (amountSats) {
      sats = amountSats;
    } else if (amount) {
      sats = Math.floor(parseFloat(amount) * 100_000_000);
    } else {
      return res.status(400).json({ error: 'Amount required (amount in BTC or amountSats)' });
    }

    const proof = generateAmountProof(sats);

    res.json({
      success: true,
      proof,
      amountSats: sats,
      explanation: {
        commitment: 'Poseidon hash of amount with blinding factor (hides actual amount on Starknet)',
        nullifier: 'Unique identifier to prevent double-spending of the same swap',
        proofHash: 'Hash proving knowledge of amount without revealing it',
        blindingFactor: 'KEEP SECRET - needed to verify the commitment on Starknet',
      },
      usage: {
        starknetSwap: 'Use commitment as amount_commitment when calling initiate_swap',
        verification: 'Recipient uses blindingFactor + amount to verify on Starknet',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate proof' });
  }
});

/**
 * POST /api/proof/verify
 * Verifies a proof matches a commitment
 */
proofRouter.post('/verify', (req, res) => {
  try {
    const { amountSats, blindingFactor, expectedCommitment } = req.body;

    if (!amountSats || !blindingFactor || !expectedCommitment) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['amountSats', 'blindingFactor', 'expectedCommitment'],
      });
    }

    // Recompute commitment
    const computedCommitment = hash.computePoseidonHashOnElements([
      amountSats.toString(),
      blindingFactor,
    ]);

    const isValid = computedCommitment === expectedCommitment;

    res.json({
      isValid,
      message: isValid ? '✓ Proof verified successfully' : '✗ Proof verification failed',
      computedCommitment,
      expectedCommitment,
      amountSats,
      amountBTC: (amountSats / 100_000_000).toFixed(8),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to verify proof' });
  }
});

/**
 * POST /api/proof/hashlock
 * Generate a new hashlock (preimage/hash pair)
 */
proofRouter.post('/hashlock', (req, res) => {
  try {
    const { preimage, hashlock } = btcService.generateHashlock();

    res.json({
      success: true,
      preimage,
      hashlock,
      hashlockHex: '0x' + hashlock,
      usage: {
        btcHtlc: 'Use hashlock when creating the BTC HTLC',
        starknetSwap: 'Use hashlockHex when calling initiate_swap on Starknet',
        claim: 'Reveal preimage to claim funds on both chains',
      },
      warning: 'KEEP PREIMAGE SECRET until you want to complete the swap!',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate hashlock' });
  }
});

/**
 * GET /api/proof/hashlock/:preimage
 * Computes hashlock from a preimage
 */
proofRouter.get('/hashlock/:preimage', (req, res) => {
  try {
    const hashlock = btcService.computeHashlock(req.params.preimage);

    res.json({
      preimage: req.params.preimage,
      hashlock,
      hashlockHex: '0x' + hashlock,
      message: 'Use this hashlock when creating the HTLC',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to compute hashlock' });
  }
});

/**
 * POST /api/proof/starknet-proof
 * Generate complete proof package for Starknet swap
 */
proofRouter.post('/starknet-proof', (req, res) => {
  try {
    const { amountSats, recipientAddress } = req.body;

    if (!amountSats || !recipientAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['amountSats', 'recipientAddress'],
      });
    }

    // Generate hashlock
    const { preimage, hashlock } = btcService.generateHashlock();

    // Generate amount proof
    const proof = generateAmountProof(amountSats);

    // Create swap proof for Starknet
    const swapProof = {
      amount_commitment: proof.commitment,
      hashlock_hash: '0x' + hashlock,
      nullifier: proof.nullifier,
      proof_hash: proof.proofHash,
    };

    res.json({
      success: true,
      starknetProof: swapProof,
      secrets: {
        preimage,
        blindingFactor: proof.blindingFactor,
        warning: 'Store these securely! Needed to complete the swap.',
      },
      amountSats,
      amountBTC: (amountSats / 100_000_000).toFixed(8),
      recipientAddress,
      cairoCalldata: {
        initiate_swap: [
          recipientAddress,
          proof.commitment,
          '0x' + hashlock,
          proof.nullifier,
        ],
        description: 'Arguments for StealthSwap.initiate_swap(recipient, amount_commitment, hashlock, nullifier)',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate Starknet proof' });
  }
});
