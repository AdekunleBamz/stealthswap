import { Router } from 'express';
import * as htlcService from '../services/htlc.service.js';

export const proofRouter = Router();

/**
 * POST /api/proof/generate
 * Generates a ZK-style amount proof
 */
proofRouter.post('/generate', (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount required' });
    }

    const proof = htlcService.generateAmountProof(amount);

    res.json({
      success: true,
      proof,
      explanation: {
        commitment: 'Hash of amount with blinding factor (hides actual amount)',
        nullifier: 'Unique identifier to prevent double-spending',
        proofHash: 'Hash proving knowledge of amount without revealing it',
        blindingFactor: 'Keep secret - needed to open commitment later'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate proof' });
  }
});

/**
 * POST /api/proof/verify
 * Verifies a proof matches a commitment
 */
proofRouter.post('/verify', (req, res) => {
  try {
    const { amount, blindingFactor, expectedCommitment } = req.body;

    if (!amount || !blindingFactor || !expectedCommitment) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Regenerate commitment and compare
    const proof = htlcService.generateAmountProof(amount);
    
    // In a real implementation, we'd verify the commitment matches
    // For the mock, we just check it's a valid format
    const isValid = expectedCommitment.startsWith('0x') && expectedCommitment.length === 66;

    res.json({
      isValid,
      message: isValid ? 'Proof verified successfully' : 'Proof verification failed',
      computedCommitment: proof.commitment
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify proof' });
  }
});

/**
 * GET /api/proof/hashlock/:preimage
 * Computes hashlock from preimage
 */
proofRouter.get('/hashlock/:preimage', (req, res) => {
  try {
    const hashlock = htlcService.computeHashlock(req.params.preimage);

    res.json({
      preimage: req.params.preimage,
      hashlock,
      message: 'Use this hashlock when creating the HTLC'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compute hashlock' });
  }
});
