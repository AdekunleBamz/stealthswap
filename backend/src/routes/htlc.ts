import { Router } from 'express';
import * as htlcService from '../services/htlc.service.js';

export const htlcRouter = Router();

/**
 * POST /api/htlc/create
 * Creates a new mock BTC HTLC
 */
htlcRouter.post('/create', (req, res) => {
  try {
    const { sender, receiver, amount, hashlock, timelockMinutes } = req.body;

    if (!sender || !receiver || !amount || !hashlock) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const htlc = htlcService.createHTLC(
      sender,
      receiver,
      amount,
      hashlock,
      timelockMinutes || 60
    );

    res.json({
      success: true,
      htlc,
      message: 'BTC HTLC created successfully (mock)'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create HTLC' });
  }
});

/**
 * POST /api/htlc/:id/lock
 * Locks an HTLC (simulates BTC confirmation)
 */
htlcRouter.post('/:id/lock', (req, res) => {
  try {
    const htlc = htlcService.lockHTLC(req.params.id);
    
    if (!htlc) {
      return res.status(404).json({ error: 'HTLC not found or cannot be locked' });
    }

    res.json({
      success: true,
      htlc,
      message: 'BTC HTLC locked (mock confirmation)'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to lock HTLC' });
  }
});

/**
 * POST /api/htlc/:id/complete
 * Completes an HTLC with preimage
 */
htlcRouter.post('/:id/complete', (req, res) => {
  try {
    const { preimage } = req.body;
    
    if (!preimage) {
      return res.status(400).json({ error: 'Preimage required' });
    }

    const htlc = htlcService.completeHTLC(req.params.id, preimage);
    
    if (!htlc) {
      return res.status(400).json({ error: 'Invalid preimage or HTLC state' });
    }

    res.json({
      success: true,
      htlc,
      message: 'BTC HTLC completed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete HTLC' });
  }
});

/**
 * POST /api/htlc/:id/refund
 * Refunds an expired HTLC
 */
htlcRouter.post('/:id/refund', (req, res) => {
  try {
    const htlc = htlcService.refundHTLC(req.params.id);
    
    if (!htlc) {
      return res.status(400).json({ error: 'HTLC not expired or not found' });
    }

    res.json({
      success: true,
      htlc,
      message: 'BTC HTLC refunded'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refund HTLC' });
  }
});

/**
 * GET /api/htlc/:id
 * Gets an HTLC by ID
 */
htlcRouter.get('/:id', (req, res) => {
  const htlc = htlcService.getHTLC(req.params.id);
  
  if (!htlc) {
    return res.status(404).json({ error: 'HTLC not found' });
  }

  res.json({ htlc });
});

/**
 * GET /api/htlc
 * Gets all HTLCs
 */
htlcRouter.get('/', (req, res) => {
  const htlcs = htlcService.getAllHTLCs();
  res.json({ htlcs, count: htlcs.length });
});

/**
 * GET /api/htlc/generate/preimage
 * Generates a random preimage and its hashlock
 */
htlcRouter.get('/generate/preimage', (req, res) => {
  const preimage = htlcService.generatePreimage();
  const hashlock = htlcService.computeHashlock(preimage);

  res.json({
    preimage,
    hashlock,
    message: 'Keep preimage secret until ready to claim!'
  });
});
