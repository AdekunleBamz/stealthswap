import { Router, Request, Response } from 'express';
import * as btcService from '../services/bitcoin.service.js';
import { RpcProvider, hash } from 'starknet';

export const swapRouter = Router();

// In-memory storage for swaps
const swaps = new Map<string, any>();

const STARKNET_RPC_URL =
  process.env.STARKNET_RPC_URL || 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo';

function parseSwapIdFromReceipt(receipt: any) {
  const selector = hash.getSelectorFromName('SwapInitiated');
  const events = receipt?.events || [];
  const match = events.find((event: any) => event?.keys?.[0] === selector);
  return match?.keys?.[1];
}

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
swapRouter.post('/initiate', async (req: Request, res: Response) => {
  try {
    const {
      senderWIF,
      senderPubKey,
      senderBtcAddress,
      recipientStarknetAddress,
      receiverStarknetAddress, // Alternative field name from frontend
      recipientBtcPubKey,
      btcAmountSats,
      btcAmount, // Alternative: BTC as string (e.g., "0.001")
      timelockBlocks = 144, // Default ~24 hours
      timelockMinutes, // Alternative: minutes instead of blocks
    } = req.body;

    // Support alternative field names from frontend
    const starknetAddress = recipientStarknetAddress || receiverStarknetAddress;
    
    // Convert BTC string to satoshis if needed
    let amountSats = btcAmountSats;
    if (!amountSats && btcAmount) {
      amountSats = Math.floor(parseFloat(btcAmount) * 100_000_000);
    }
    
    // Convert minutes to blocks if needed (1 block ≈ 10 minutes)
    let lockBlocks = timelockBlocks;
    if (timelockMinutes) {
      lockBlocks = Math.ceil(timelockMinutes / 10);
    }

    // Validate required fields - only need starknet address and amount
    if (!starknetAddress || !amountSats) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['receiverStarknetAddress (or recipientStarknetAddress)', 'btcAmount (or btcAmountSats)'],
        optional: ['senderBtcAddress', 'senderPubKey', 'recipientBtcPubKey', 'timelockMinutes', 'timelockBlocks'],
      });
    }
    
    // Generate demo keys if not provided (for hackathon demo)
    const demoSenderPubKey = senderPubKey || btcService.generateWallet().publicKey;
    const demoRecipientPubKey = recipientBtcPubKey || btcService.generateWallet().publicKey;

    // Generate hashlock (preimage/secret)
    const { preimage, hashlock } = btcService.generateHashlock();

    // Get current block height
    const currentHeight = await btcService.getBlockHeight();
    const timelock = currentHeight + lockBlocks;

    // Create HTLC script
    const htlcScript = btcService.createHTLCScript({
      recipientPubKey: Buffer.from(demoRecipientPubKey, 'hex'),
      senderPubKey: Buffer.from(demoSenderPubKey, 'hex'),
      hashlock: Buffer.from(hashlock, 'hex'),
      timelock,
    });

    const htlcAddress = btcService.getHTLCAddress(htlcScript);

    // Generate amount commitment for Starknet (ZK privacy)
    const blindingFactor = '0x' + Buffer.from(btcService.generateHashlock().preimage, 'hex').toString('hex').slice(0, 64);
    const amountCommitment = hash.computePoseidonHashOnElements([
      amountSats.toString(),
      blindingFactor,
    ]);

    // Create swap record
    const senderPubKeyFelt = demoSenderPubKey.startsWith('0x') ? demoSenderPubKey : `0x${demoSenderPubKey}`;
    const hashlockFelt = hashlock.startsWith('0x') ? hashlock : `0x${hashlock}`;
    const swapId = hash.computePoseidonHashOnElements([
      senderPubKeyFelt,
      starknetAddress,
      hashlockFelt,
      Date.now().toString(),
    ]);

    const swap = {
      id: swapId,
      status: 'initiated',
      btc: {
        htlcAddress,
        htlcScript: htlcScript.toString('hex'),
        senderPubKey: demoSenderPubKey,
        recipientPubKey: demoRecipientPubKey,
        amountSats: amountSats,
        hashlock,
        timelock,
        timelockBlocks: lockBlocks,
        fundingTxid: null as string | null,
      },
      starknet: {
        recipientAddress: starknetAddress,
        amountCommitment,
        blindingFactor,
        swapId: null,
        txHash: null as string | null,
      },
      // Store secrets for recovery (in production, encrypt or use secure storage)
      secrets: {
        preimage,
        starknetPreimage: null as string | null, // Set after hashlock generation
      },
      privacyScore: calculatePrivacyScore(amountSats, lockBlocks),
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
          amountSats
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

    // Calculate Starknet timelock: current time + requested minutes + 5 min safety margin
    const starknetTimelockSeconds = timelockMinutes ? (timelockMinutes * 60) : (lockBlocks * 10 * 60);
    const starknetTimelock = Math.floor(Date.now() / 1000) + starknetTimelockSeconds + 300; // +5 min safety margin

    // Generate Starknet-compatible hashlock using Poseidon hash
    // SAFETY: We use 31-byte preimages (248 bits) to ensure Poseidon output fits in felt252 (252 bits).
    // The truncation below is a defensive check - in practice, Poseidon(31 bytes) never exceeds felt252.
    const starknetPreimage = '0x' + Buffer.from(preimage, 'hex').toString('hex').slice(0, 62);
    const rawStarknetHashlock = hash.computePoseidonHashOnElements([starknetPreimage]);
    
    // Truncate hashlock to fit felt252 (max 252 bits = 63 hex chars after 0x)
    // This defensive truncation ensures compatibility even if hash output varies
    const truncateToFelt252 = (h: string): string => {
      const hex = h.replace('0x', '');
      return '0x' + (hex.length > 63 ? hex.slice(0, 63) : hex);
    };
    const starknetHashlock = truncateToFelt252(rawStarknetHashlock);

    // Save starknet preimage to swap for recovery
    swap.secrets.starknetPreimage = starknetPreimage;
    swaps.set(swapId, swap);

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
        amountSats: amountSats,
        amountBTC: (amountSats / 100_000_000).toFixed(8),
        timelock,
        timelockBlocks: lockBlocks,
        currentHeight,
        fundingTx,
      },
      starknet: {
        recipientAddress: starknetAddress,
        amountCommitment,
        hashlock: starknetHashlock,
        timelockTimestamp: starknetTimelock,
      },
      secrets: {
        preimage: preimage,
        starknetPreimage: starknetPreimage,  // Use this for Starknet complete_swap
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
swapRouter.post('/:id/fund', async (req: Request, res: Response) => {
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
swapRouter.post('/:id/link-starknet', async (req: Request, res: Response) => {
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
 * POST /api/swap/:id/status
 * Update swap status (called by frontend after Starknet transactions)
 */
swapRouter.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, starknetTxHash, starknetSwapId } = req.body;
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    // Update status
    if (status) {
      swap.status = status;
    }
    
    // Update starknet data if provided
    if (starknetTxHash) {
      swap.starknet = swap.starknet || {};
      swap.starknet.txHash = starknetTxHash;
    }
    if (starknetSwapId) {
      swap.starknet = swap.starknet || {};
      swap.starknet.swapId = starknetSwapId;
    }
    
    swaps.set(req.params.id, swap);

    res.json({
      success: true,
      swap: {
        id: swap.id,
        status: swap.status,
        starknetTxHash: swap.starknet?.txHash,
        starknetSwapId: swap.starknet?.swapId,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update swap status' });
  }
});

/**
 * POST /api/swap/:id/resolve-starknet
 * Resolve Starknet swap ID from a transaction hash (server-side RPC avoids CORS)
 */
swapRouter.post('/:id/resolve-starknet', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.body as { txHash?: string };
    if (!txHash) {
      return res.status(400).json({ error: 'txHash is required' });
    }

    const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
    const receipt = await provider.getTransactionReceipt(txHash);
    console.log('[resolve-starknet] receipt:', JSON.stringify(receipt, null, 2));

    const swapId = parseSwapIdFromReceipt(receipt);
    console.log('[resolve-starknet] parsed swapId:', swapId);

    if (!swapId) {
      // Try alternative: look for any event with keys[1]
      const events = (receipt as any)?.events || [];
      console.log('[resolve-starknet] events count:', events.length);
      for (const ev of events) {
        console.log('[resolve-starknet] event keys:', ev?.keys);
      }
      return res.status(202).json({
        success: false,
        message: 'Swap ID not found in receipt yet. Try again shortly.',
      });
    }

    res.json({ success: true, swapId });
  } catch (error: any) {
    console.error('[resolve-starknet] error:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve swap ID' });
  }
});

/**
 * POST /api/swap/:id/complete
 * Complete the swap (claim BTC with preimage)
 */
swapRouter.post('/:id/complete', async (req: Request, res: Response) => {
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
swapRouter.post('/:id/broadcast-claim', async (req: Request, res: Response) => {
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
swapRouter.post('/:id/refund', async (req: Request, res: Response) => {
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
swapRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const swap = swaps.get(req.params.id);

    if (!swap) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    const currentHeight = await btcService.getBlockHeight();
    const blocksRemaining = Math.max(0, swap.btc.timelock - currentHeight);

    res.json({
      success: true,
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
        hashlock: swap.btc.hashlock,
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
        amountCommitment: swap.starknet.amountCommitment,
        hashlock: '0x' + swap.btc.hashlock,
        timelockTimestamp: Math.floor(swap.createdAt / 1000) + (swap.btc.timelockBlocks * 10 * 60),
        swapId: swap.starknet.swapId,
        txHash: swap.starknet.txHash,
      },
      // Include secrets for recovery (only if swap is not completed)
      secrets: swap.status !== 'completed' && swap.secrets ? {
        preimage: swap.secrets.preimage,
        starknetPreimage: swap.secrets.starknetPreimage,
        warning: 'KEEP THESE SECRET! Only reveal preimage when completing the swap.',
      } : undefined,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch swap' });
  }
});

/**
 * GET /api/swap
 * List all swaps
 */
swapRouter.get('/', async (req: Request, res: Response) => {
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
