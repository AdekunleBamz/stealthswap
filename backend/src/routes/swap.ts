import { Router } from 'express';
import * as btcService from '../services/bitcoin.service.js';
import { hash } from 'starknet';

export const swapRouter = Router();

// In-memory storage for swaps
const swaps = new Map<string, any>();

/**
 * Calculate privacy score based on swap parameters
 */
function calculatePrivacyScore(amountSats: number, timelockBlocks: number): number {
  let score = 50;

  // Longer timelocks = more privacy
  if (timelockBlocks > 144) score += 10;
  if (timelockBlocks > 288) score += 10;

  // Non-round amounts = more privacy
  if (amountSats % 100000 !== 0) score += 10;
  if (amountSats % 10000 !== 0) score += 5;

  // Random factor for demo
  score += Math.floor(Math.random() * 15);

  return Math.min(score, 100);
}

/**
 * POST /api/swap/initiate
 * Initiate a complete BTC → Starknet atomic swap
 */
swapRouter.post('/initiate', async (req, res) => {
  try {
    const {
      senderWIF,
      senderPubKey,
      recipientStarknetAddress,
      recipientBtcPubKey,
      btcAmountSats,
      timelockBlocks = 144, // Default ~24 hours
    } = req.body;

    // Validate required fields
    if (!senderPubKey || !recipientStarknetAddress || !recipientBtcPubKey || !btcAmountSats) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['senderPubKey', 'recipientStarknetAddress', 'recipientBtcPubKey', 'btcAmountSats'],
        optional: ['senderWIF', 'timelockBlocks'],
      });
    }

    // Generate hashlock (preimage/secret)
    const { preimage, hashlock } = btcService.generateHashlock();

    // Get current block height
    const currentHeight = await btcService.getBlockHeight();
    const timelock = currentHeight + timelockBlocks;

    // Create HTLC script
    const htlcScript = btcService.createHTLCScript({
      recipientPubKey: Buffer.from(recipientBtcPubKey, 'hex'),
      senderPubKey: Buffer.from(senderPubKey, 'hex'),
      hashlock: Buffer.from(hashlock, 'hex'),
      timelock,
    });

    const htlcAddress = btcService.getHTLCAddress(htlcScript);

    // Generate amount commitment for Starknet (ZK privacy)
    const blindingFactor = '0x' + Buffer.from(btcService.generateHashlock().preimage, 'hex').toString('hex').slice(0, 64);
    const amountCommitment = hash.computePoseidonHashOnElements([
      btcAmountSats.toString(),
      blindingFactor,
    ]);

    // Create swap record
    const swapId = hash.computePoseidonHashOnElements([
      senderPubKey,
      recipientStarknetAddress,
      hashlock,
      Date.now().toString(),
    ]);

    const swap = {
      id: swapId,
      status: 'initiated',
      btc: {
        htlcAddress,
        htlcScript: htlcScript.toString('hex'),
        senderPubKey,
        recipientPubKey: recipientBtcPubKey,
        amountSats: btcAmountSats,
        hashlock,
        timelock,
        timelockBlocks,
        fundingTxid: null as string | null,
      },
      starknet: {
        recipientAddress: recipientStarknetAddress,
        amountCommitment,
        blindingFactor,
        swapId: null,
      },
      privacyScore: calculatePrivacyScore(btcAmountSats, timelockBlocks),
      createdAt: Date.now(),
    };

    swaps.set(swapId, swap);

    // If WIF provided, also create the funding transaction
    let fundingTx: { hex: string; txid: string } | null = null;
    if (senderWIF) {
      try {
        const { txHex, txid } = await btcService.createHTLCFundingTx(
          senderWIF,
          htlcScript,
          btcAmountSats
        );
        swap.btc.fundingTxid = txid;
        swap.status = 'btc_tx_created';
        swaps.set(swapId, swap);

        fundingTx = { hex: txHex, txid };
      } catch (err: any) {
        // Continue without funding tx - user can fund manually
        console.log('Could not create funding tx:', err.message);
      }
    }

    res.json({
      success: true,
      swap: {
        id: swapId,
        status: swap.status,
        privacyScore: swap.privacyScore,
        createdAt: swap.createdAt,
      },
      btc: {
        htlcAddress,
        amountSats: btcAmountSats,
        amountBTC: (btcAmountSats / 100_000_000).toFixed(8),
        timelock,
        timelockBlocks,
        currentHeight,
        fundingTx,
      },
      starknet: {
        recipientAddress: recipientStarknetAddress,
        amountCommitment,
        hashlock: '0x' + hashlock,
        timelockTimestamp: Math.floor(Date.now() / 1000) + (timelockBlocks * 10 * 60),
      },
      secrets: {
        preimage: preimage,
        blindingFactor,
        warning: 'KEEP THESE SECRET! Only reveal preimage when completing the swap.',
      },
      nextSteps: [
        fundingTx
          ? `1. Broadcast BTC transaction: POST /api/htlc/${swap.btc.fundingTxid}/broadcast`
          : `1. Send ${(btcAmountSats / 100_000_000).toFixed(8)} BTC to HTLC address: ${htlcAddress}`,
        '2. Create Starknet swap with the amountCommitment and hashlock',
        '3. Wait for counterparty to lock on Starknet',
        '4. Complete swap by revealing preimage on both chains',
      ],
    });
  } catch (error: any) {
    console.error('Swap initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate swap' });
  }
});

/**
 * POST /api/swap/:id/fund
 * Fund a swap by broadcasting the BTC transaction
 */
swapRouter.post('/:id/fund', async (req, res) => {
  try {
    const { txHex } = req.body;
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    if (!txHex) {
      return res.status(400).json({ error: 'Transaction hex required' });
    }

    const txid = await btcService.broadcastTransaction(txHex);

    swap.btc.fundingTxid = txid;
    swap.status = 'btc_funded';
    swaps.set(req.params.id, swap);

    res.json({
      success: true,
      swap: {
        id: swap.id,
        status: swap.status,
      },
      txid,
      explorerUrl: `https://blockstream.info/testnet/tx/${txid}`,
      message: 'BTC locked in HTLC! Now create the Starknet swap.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to broadcast transaction' });
  }
});

/**
 * POST /api/swap/:id/link-starknet
 * Link a Starknet swap ID to this swap
 */
swapRouter.post('/:id/link-starknet', async (req, res) => {
  try {
    const { starknetSwapId, starknetTxHash } = req.body;
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    swap.starknet.swapId = starknetSwapId;
    swap.starknet.txHash = starknetTxHash;
    swap.status = 'starknet_locked';
    swaps.set(req.params.id, swap);

    res.json({
      success: true,
      swap: {
        id: swap.id,
        status: swap.status,
        btcFundingTxid: swap.btc.fundingTxid,
        starknetSwapId,
        starknetTxHash,
      },
      message: 'Both sides locked! Ready to complete swap with preimage.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to link Starknet swap' });
  }
});

/**
 * POST /api/swap/:id/complete
 * Complete the swap (claim BTC with preimage)
 */
swapRouter.post('/:id/complete', async (req, res) => {
  try {
    const { recipientWIF, preimage } = req.body;
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    if (!recipientWIF || !preimage) {
      return res.status(400).json({ error: 'recipientWIF and preimage required' });
    }

    // Verify preimage
    const computedHash = btcService.computeHashlock(preimage);
    if (computedHash !== swap.btc.hashlock) {
      return res.status(400).json({ error: 'Invalid preimage' });
    }

    // Create claim transaction
    const { txHex, txid } = await btcService.createClaimTx(
      recipientWIF,
      Buffer.from(swap.btc.htlcScript, 'hex'),
      swap.btc.fundingTxid,
      0,
      swap.btc.amountSats,
      preimage
    );

    swap.status = 'completing';
    swap.btc.claimTxid = txid;
    swaps.set(req.params.id, swap);

    res.json({
      success: true,
      claimTx: {
        hex: txHex,
        txid,
      },
      message: 'Claim transaction created. Broadcast to receive BTC!',
      broadcastEndpoint: `/api/swap/${req.params.id}/broadcast-claim`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create claim transaction' });
  }
});

/**
 * POST /api/swap/:id/broadcast-claim
 * Broadcast the claim transaction
 */
swapRouter.post('/:id/broadcast-claim', async (req, res) => {
  try {
    const { txHex } = req.body;
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    const txid = await btcService.broadcastTransaction(txHex);

    swap.status = 'completed';
    swap.completedAt = Date.now();
    swaps.set(req.params.id, swap);

    res.json({
      success: true,
      txid,
      explorerUrl: `https://blockstream.info/testnet/tx/${txid}`,
      swap: {
        id: swap.id,
        status: 'completed',
        privacyScore: swap.privacyScore,
      },
      message: '🎉 Swap completed successfully!',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to broadcast claim transaction' });
  }
});

/**
 * POST /api/swap/:id/refund
 * Refund the swap after timelock (for sender)
 */
swapRouter.post('/:id/refund', async (req, res) => {
  try {
    const { senderWIF } = req.body;
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    if (!senderWIF) {
      return res.status(400).json({ error: 'senderWIF required' });
    }

    // Check timelock
    const currentHeight = await btcService.getBlockHeight();
    if (currentHeight < swap.btc.timelock) {
      return res.status(400).json({
        error: 'Timelock not expired',
        currentHeight,
        timelockHeight: swap.btc.timelock,
        blocksRemaining: swap.btc.timelock - currentHeight,
        estimatedMinutes: (swap.btc.timelock - currentHeight) * 10,
      });
    }

    const { txHex, txid } = await btcService.createRefundTx(
      senderWIF,
      Buffer.from(swap.btc.htlcScript, 'hex'),
      swap.btc.fundingTxid,
      0,
      swap.btc.amountSats,
      swap.btc.timelock
    );

    res.json({
      success: true,
      refundTx: {
        hex: txHex,
        txid,
      },
      message: 'Refund transaction created. Broadcast to reclaim BTC.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create refund transaction' });
  }
});

/**
 * GET /api/swap/:id
 * Get swap details
 */
swapRouter.get('/:id', async (req, res) => {
  try {
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    const currentHeight = await btcService.getBlockHeight();
    const blocksRemaining = Math.max(0, swap.btc.timelock - currentHeight);

    res.json({
      swap: {
        id: swap.id,
        status: swap.status,
        privacyScore: swap.privacyScore,
        createdAt: swap.createdAt,
        completedAt: swap.completedAt,
      },
      btc: {
        htlcAddress: swap.btc.htlcAddress,
        amountSats: swap.btc.amountSats,
        amountBTC: (swap.btc.amountSats / 100_000_000).toFixed(8),
        fundingTxid: swap.btc.fundingTxid,
        timelock: swap.btc.timelock,
        currentHeight,
        blocksRemaining,
        isExpired: blocksRemaining === 0,
        explorerUrl: swap.btc.fundingTxid
          ? `https://blockstream.info/testnet/tx/${swap.btc.fundingTxid}`
          : null,
      },
      starknet: {
        recipientAddress: swap.starknet.recipientAddress,
        swapId: swap.starknet.swapId,
        txHash: swap.starknet.txHash,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch swap' });
  }
});

/**
 * GET /api/swap
 * List all swaps
 */
swapRouter.get('/', async (req, res) => {
  try {
    const currentHeight = await btcService.getBlockHeight();

    const swapList = Array.from(swaps.values()).map((swap) => ({
      id: swap.id,
      status: swap.status,
      privacyScore: swap.privacyScore,
      btcAmount: (swap.btc.amountSats / 100_000_000).toFixed(8),
      blocksRemaining: Math.max(0, swap.btc.timelock - currentHeight),
      createdAt: swap.createdAt,
    }));

    res.json({
      swaps: swapList,
      count: swapList.length,
      currentBlockHeight: currentHeight,
      stats: {
        initiated: swapList.filter((s) => s.status === 'initiated').length,
        btcFunded: swapList.filter((s) => s.status === 'btc_funded').length,
        starknetLocked: swapList.filter((s) => s.status === 'starknet_locked').length,
        completed: swapList.filter((s) => s.status === 'completed').length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch swaps' });
  }
});
