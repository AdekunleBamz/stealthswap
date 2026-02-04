import { Router, Request, Response } from 'express';
import * as btcService from '../services/bitcoin.service.js';

export const htlcRouter = Router();

// In-memory storage for HTLCs (in production, use a database)
const htlcs = new Map<string, any>();

/**
 * POST /api/htlc/wallet/generate
 * Generate a new Bitcoin testnet wallet
 */
htlcRouter.post('/wallet/generate', (req: Request, res: Response) => {
  try {
    const wallet = btcService.generateWallet();
    const faucetInfo = btcService.getTestnetFaucetInfo();

    res.json({
      success: true,
      wallet: {
        address: wallet.address,
        publicKey: wallet.publicKey,
        // Only return WIF in development - in production, encrypt or use secure storage
        wif: wallet.wif,
      },
      faucetInfo,
      message: 'Wallet generated. Fund it using a testnet faucet before creating HTLCs.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate wallet' });
  }
});

/**
 * GET /api/htlc/wallet/:address/balance
 * Get wallet balance
 */
htlcRouter.get('/wallet/:address/balance', async (req: Request, res: Response) => {
  try {
    const balance = await btcService.getBalance(req.params.address);
    const utxos = await btcService.getUTXOs(req.params.address);

    res.json({
      address: req.params.address,
      balance: balance,
      balanceBTC: (balance / 100_000_000).toFixed(8),
      utxoCount: utxos.length,
      utxos,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch balance' });
  }
});

/**
 * GET /api/htlc/blockchain/height
 * Get current block height
 */
htlcRouter.get('/blockchain/height', async (req: Request, res: Response) => {
  try {
    const height = await btcService.getBlockHeight();
    res.json({ height, network: 'testnet' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch block height' });
  }
});

/**
 * POST /api/htlc/hashlock/generate
 * Generate a random preimage and hashlock
 */
htlcRouter.post('/hashlock/generate', (req: Request, res: Response) => {
  try {
    const { preimage, hashlock } = btcService.generateHashlock();

    res.json({
      preimage,
      hashlock,
      message: 'Keep the preimage SECRET! Share the hashlock with counterparty.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate hashlock' });
  }
});

/**
 * POST /api/htlc/create
 * Create and fund a new HTLC on Bitcoin testnet
 */
htlcRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const {
      senderWIF,
      senderPubKey,
      recipientPubKey,
      hashlock,
      timelockBlocks, // Number of blocks for timelock
      amountSats,
    } = req.body;

    // Validate required fields
    if (!senderWIF || !senderPubKey || !recipientPubKey || !hashlock || !amountSats) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['senderWIF', 'senderPubKey', 'recipientPubKey', 'hashlock', 'amountSats'],
      });
    }

    // Get current block height for timelock
    const currentHeight = await btcService.getBlockHeight();
    const timelock = currentHeight + (timelockBlocks || 144); // Default 144 blocks (~24h)

    // Create HTLC script
    const htlcScript = btcService.createHTLCScript({
      recipientPubKey: Buffer.from(recipientPubKey, 'hex'),
      senderPubKey: Buffer.from(senderPubKey, 'hex'),
      hashlock: Buffer.from(hashlock, 'hex'),
      timelock,
    });

    const htlcAddress = btcService.getHTLCAddress(htlcScript);

    // Create and sign funding transaction
    const { txHex, txid } = await btcService.createHTLCFundingTx(
      senderWIF,
      htlcScript,
      amountSats
    );

    // Store HTLC info
    const htlcId = txid;
    htlcs.set(htlcId, {
      id: htlcId,
      htlcAddress,
      htlcScript: htlcScript.toString('hex'),
      senderPubKey,
      recipientPubKey,
      hashlock,
      timelock,
      amountSats,
      fundingTxid: txid,
      status: 'pending_broadcast',
      createdAt: Date.now(),
    });

    res.json({
      success: true,
      htlc: {
        id: htlcId,
        htlcAddress,
        fundingTxid: txid,
        timelock,
        timelockBlocks: timelock - currentHeight,
        amountSats,
        status: 'pending_broadcast',
      },
      transaction: {
        hex: txHex,
        txid,
      },
      message: 'HTLC created. Broadcast the transaction to fund it.',
      broadcastUrl: `https://blockstream.info/testnet/tx/${txid}`,
    });
  } catch (error: any) {
    console.error('HTLC creation error:', error);
    res.status(500).json({ error: error.message || 'Failed to create HTLC' });
  }
});

/**
 * POST /api/htlc/:id/broadcast
 * Broadcast an HTLC funding transaction
 */
htlcRouter.post('/:id/broadcast', async (req: Request, res: Response) => {
  try {
    const { txHex } = req.body;

    if (!txHex) {
      return res.status(400).json({ error: 'Transaction hex required' });
    }

    const txid = await btcService.broadcastTransaction(txHex);

    // Update HTLC status
    const htlc = htlcs.get(req.params.id);
    if (htlc) {
      htlc.status = 'funded';
      htlcs.set(req.params.id, htlc);
    }

    res.json({
      success: true,
      txid,
      explorerUrl: `https://blockstream.info/testnet/tx/${txid}`,
      message: 'Transaction broadcast successfully!',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to broadcast transaction' });
  }
});

/**
 * POST /api/htlc/:id/claim
 * Claim an HTLC with the preimage (for recipient)
 */
htlcRouter.post('/:id/claim', async (req: Request, res: Response) => {
  try {
    const { recipientWIF, preimage } = req.body;

    if (!recipientWIF || !preimage) {
      return res.status(400).json({ error: 'recipientWIF and preimage required' });
    }

    const htlc = htlcs.get(req.params.id);
    if (!htlc) {
      return res.status(404).json({ error: 'HTLC not found' });
    }

    // Verify preimage matches hashlock
    const computedHash = btcService.computeHashlock(preimage);
    if (computedHash !== htlc.hashlock) {
      return res.status(400).json({ error: 'Invalid preimage - does not match hashlock' });
    }

    // Create claim transaction
    const { txHex, txid } = await btcService.createClaimTx(
      recipientWIF,
      Buffer.from(htlc.htlcScript, 'hex'),
      htlc.fundingTxid,
      0, // Assuming HTLC is first output
      htlc.amountSats,
      preimage
    );

    res.json({
      success: true,
      claimTx: {
        hex: txHex,
        txid,
      },
      message: 'Claim transaction created. Broadcast to complete the swap.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create claim transaction' });
  }
});

/**
 * POST /api/htlc/:id/refund
 * Refund an HTLC after timelock expires (for sender)
 */
htlcRouter.post('/:id/refund', async (req: Request, res: Response) => {
  try {
    const { senderWIF } = req.body;

    if (!senderWIF) {
      return res.status(400).json({ error: 'senderWIF required' });
    }

    const htlc = htlcs.get(req.params.id);
    if (!htlc) {
      return res.status(404).json({ error: 'HTLC not found' });
    }

    // Check if timelock has expired
    const currentHeight = await btcService.getBlockHeight();
    if (currentHeight < htlc.timelock) {
      return res.status(400).json({
        error: 'Timelock not expired',
        currentHeight,
        timelockHeight: htlc.timelock,
        blocksRemaining: htlc.timelock - currentHeight,
      });
    }

    // Create refund transaction
    const { txHex, txid } = await btcService.createRefundTx(
      senderWIF,
      Buffer.from(htlc.htlcScript, 'hex'),
      htlc.fundingTxid,
      0,
      htlc.amountSats,
      htlc.timelock
    );

    res.json({
      success: true,
      refundTx: {
        hex: txHex,
        txid,
      },
      message: 'Refund transaction created. Broadcast to reclaim funds.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create refund transaction' });
  }
});

/**
 * GET /api/htlc/:id
 * Get HTLC details
 */
htlcRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const htlc = htlcs.get(req.params.id);
    if (!htlc) {
      return res.status(404).json({ error: 'HTLC not found' });
    }

    // Get current block height to calculate time remaining
    const currentHeight = await btcService.getBlockHeight();
    const blocksRemaining = Math.max(0, htlc.timelock - currentHeight);
    const estimatedMinutes = blocksRemaining * 10; // ~10 min per block

    res.json({
      htlc: {
        ...htlc,
        htlcScript: undefined, // Don't expose full script
      },
      timelockInfo: {
        currentHeight,
        timelockHeight: htlc.timelock,
        blocksRemaining,
        estimatedMinutesRemaining: estimatedMinutes,
        isExpired: blocksRemaining === 0,
      },
      explorerUrl: `https://blockstream.info/testnet/tx/${htlc.fundingTxid}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch HTLC' });
  }
});

/**
 * GET /api/htlc
 * List all HTLCs
 */
htlcRouter.get('/', (req: Request, res: Response) => {
  const htlcList = Array.from(htlcs.values()).map((htlc) => ({
    id: htlc.id,
    htlcAddress: htlc.htlcAddress,
    amountSats: htlc.amountSats,
    status: htlc.status,
    createdAt: htlc.createdAt,
  }));

  res.json({
    htlcs: htlcList,
    count: htlcList.length,
  });
});

/**
 * GET /api/htlc/faucet/info
 * Get testnet faucet information
 */
htlcRouter.get('/faucet/info', (req: Request, res: Response) => {
  res.json({
    network: 'Bitcoin Testnet',
    faucets: [
      { name: 'Coinfaucet', url: 'https://coinfaucet.eu/en/btc-testnet/' },
      { name: 'Mempool Faucet', url: 'https://testnet-faucet.mempool.co/' },
      { name: 'Bitcoin Faucet', url: 'https://bitcoinfaucet.uo1.net/' },
      { name: 'Bitaps', url: 'https://tbtc.bitaps.com/' },
    ],
    explorer: 'https://blockstream.info/testnet/',
    message: 'Use any faucet to get testnet BTC for testing swaps',
  });
});
