import { Router } from 'express';
import * as htlcService from '../services/htlc.service.js';

export const swapRouter = Router();

/**
 * POST /api/swap/initiate
 * Initiates a full BTC -> Starknet swap
 */
swapRouter.post('/initiate', (req, res) => {
  try {
    const { senderBtcAddress, receiverStarknetAddress, btcAmount, timelockMinutes } = req.body;

    if (!senderBtcAddress || !receiverStarknetAddress || !btcAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate preimage and hashlock
    const preimage = htlcService.generatePreimage();
    const hashlock = htlcService.computeHashlock(preimage);

    // Create BTC HTLC
    const htlc = htlcService.createHTLC(
      senderBtcAddress,
      receiverStarknetAddress,
      btcAmount,
      hashlock,
      timelockMinutes || 60
    );

    // Create swap
    const swap = htlcService.createSwap(htlc);

    // Generate amount proof for privacy
    const amountProof = htlcService.generateAmountProof(btcAmount);

    res.json({
      success: true,
      swap,
      preimage, // In production, this would be encrypted/stored securely
      hashlock,
      amountProof,
      starknetParams: {
        participant: receiverStarknetAddress,
        amountHash: amountProof.commitment,
        hashlock,
        timelock: htlc.timelock
      },
      message: 'Swap initiated. Now lock on Starknet with the provided params.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to initiate swap' });
  }
});

/**
 * POST /api/swap/:id/link-starknet
 * Links a Starknet swap ID to the swap
 */
swapRouter.post('/:id/link-starknet', (req, res) => {
  try {
    const { starknetSwapId } = req.body;

    if (!starknetSwapId) {
      return res.status(400).json({ error: 'Starknet swap ID required' });
    }

    const swap = htlcService.linkStarknetSwap(req.params.id, starknetSwapId);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    // Also lock the BTC HTLC
    htlcService.lockHTLC(swap.btcHtlc.id);

    res.json({
      success: true,
      swap,
      message: 'Swap linked to Starknet. BTC is now locked.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to link Starknet swap' });
  }
});

/**
 * GET /api/swap/:id
 * Gets a swap by ID
 */
swapRouter.get('/:id', (req, res) => {
  const swap = htlcService.getSwap(req.params.id);

  if (!swap) {
    return res.status(404).json({ error: 'Swap not found' });
  }

  // Check for expiry
  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = swap.btcHtlc.timelock - now;

  res.json({
    swap,
    timeRemaining: Math.max(0, timeRemaining),
    isExpired: timeRemaining <= 0
  });
});

/**
 * GET /api/swap
 * Gets all swaps
 */
swapRouter.get('/', (req, res) => {
  const swaps = htlcService.getAllSwaps();
  
  // Check for expired HTLCs
  htlcService.checkExpiredHTLCs();

  res.json({
    swaps,
    count: swaps.length,
    stats: {
      initiated: swaps.filter(s => s.status === 'initiated').length,
      btcLocked: swaps.filter(s => s.status === 'btc_locked').length,
      starknetLocked: swaps.filter(s => s.status === 'starknet_locked').length,
      completed: swaps.filter(s => s.status === 'completed').length,
      failed: swaps.filter(s => s.status === 'failed').length,
    }
  });
});
