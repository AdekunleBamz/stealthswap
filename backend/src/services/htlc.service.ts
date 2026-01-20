import { HTLC, Swap, AmountProof } from '../types.js';
import { v4 as uuidv4 } from 'uuid';
import { hash } from 'starknet';

// In-memory storage (mock database)
const htlcs: Map<string, HTLC> = new Map();
const swaps: Map<string, Swap> = new Map();

/**
 * Creates a mock BTC HTLC
 */
export function createHTLC(
  sender: string,
  receiver: string,
  amount: string,
  hashlock: string,
  timelockMinutes: number
): HTLC {
  const now = Math.floor(Date.now() / 1000);
  const htlc: HTLC = {
    id: uuidv4(),
    sender,
    receiver,
    amount,
    hashlock,
    timelock: now + (timelockMinutes * 60),
    status: 'pending',
    createdAt: now,
    txid: `mock_btc_tx_${uuidv4().slice(0, 8)}`
  };

  htlcs.set(htlc.id, htlc);
  return htlc;
}

/**
 * Locks an HTLC (simulates BTC being locked on-chain)
 */
export function lockHTLC(htlcId: string): HTLC | null {
  const htlc = htlcs.get(htlcId);
  if (!htlc || htlc.status !== 'pending') return null;

  htlc.status = 'locked';
  htlcs.set(htlcId, htlc);
  return htlc;
}

/**
 * Completes an HTLC with the preimage
 */
export function completeHTLC(htlcId: string, preimage: string): HTLC | null {
  const htlc = htlcs.get(htlcId);
  if (!htlc || htlc.status !== 'locked') return null;

  // Verify preimage
  const computedHash = computeHashlock(preimage);
  if (computedHash !== htlc.hashlock) return null;

  htlc.status = 'completed';
  htlcs.set(htlcId, htlc);
  return htlc;
}

/**
 * Refunds an HTLC after timelock expires
 */
export function refundHTLC(htlcId: string): HTLC | null {
  const htlc = htlcs.get(htlcId);
  if (!htlc) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now <= htlc.timelock) return null;

  htlc.status = 'refunded';
  htlcs.set(htlcId, htlc);
  return htlc;
}

/**
 * Gets an HTLC by ID
 */
export function getHTLC(htlcId: string): HTLC | undefined {
  return htlcs.get(htlcId);
}

/**
 * Gets all HTLCs
 */
export function getAllHTLCs(): HTLC[] {
  return Array.from(htlcs.values());
}

/**
 * Creates a new swap
 */
export function createSwap(btcHtlc: HTLC): Swap {
  const swap: Swap = {
    id: uuidv4(),
    btcHtlc,
    status: 'initiated',
    privacyScore: calculatePrivacyScore(btcHtlc),
    createdAt: Math.floor(Date.now() / 1000),
  };

  swaps.set(swap.id, swap);
  return swap;
}

/**
 * Updates swap with Starknet swap ID
 */
export function linkStarknetSwap(swapId: string, starknetSwapId: string): Swap | null {
  const swap = swaps.get(swapId);
  if (!swap) return null;

  swap.starknetSwapId = starknetSwapId;
  swap.status = 'starknet_locked';
  swaps.set(swapId, swap);
  return swap;
}

/**
 * Gets a swap by ID
 */
export function getSwap(swapId: string): Swap | undefined {
  return swaps.get(swapId);
}

/**
 * Gets all swaps
 */
export function getAllSwaps(): Swap[] {
  return Array.from(swaps.values());
}

/**
 * Computes hashlock using Poseidon hash (matching Cairo implementation)
 */
export function computeHashlock(preimage: string): string {
  return hash.computePoseidonHash(preimage, '0');
}

/**
 * Generates a random preimage
 */
export function generatePreimage(): string {
  return '0x' + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * Generates amount proof for ZK verification
 */
export function generateAmountProof(amount: string): AmountProof {
  const blindingFactor = generatePreimage();
  const amountBigInt = BigInt(amount);
  
  // Compute commitment = hash(amount_low, amount_high, blinding_factor)
  const amountLow = amountBigInt & BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
  const amountHigh = amountBigInt >> BigInt(128);
  
  const commitment = hash.computePoseidonHashOnElements([
    amountLow.toString(),
    amountHigh.toString(),
    blindingFactor
  ]);

  const nullifier = generatePreimage();
  const proofHash = hash.computePoseidonHashOnElements([
    commitment,
    nullifier,
    blindingFactor
  ]);

  return {
    commitment,
    nullifier,
    proofHash,
    blindingFactor
  };
}

/**
 * Calculates privacy score based on various factors
 */
function calculatePrivacyScore(htlc: HTLC): number {
  let score = 50; // Base score

  // Longer timelocks = more privacy (harder to correlate)
  const timelockDuration = htlc.timelock - htlc.createdAt;
  if (timelockDuration > 3600) score += 10; // > 1 hour
  if (timelockDuration > 86400) score += 15; // > 1 day

  // Random amount-based scoring (simulating mixing)
  const amountVariance = parseInt(htlc.amount) % 1000;
  if (amountVariance !== 0) score += 10; // Non-round amount

  // Add some randomness to simulate network conditions
  score += Math.floor(Math.random() * 15);

  return Math.min(score, 100);
}

/**
 * Checks and updates expired HTLCs
 */
export function checkExpiredHTLCs(): HTLC[] {
  const now = Math.floor(Date.now() / 1000);
  const expired: HTLC[] = [];

  htlcs.forEach((htlc, id) => {
    if ((htlc.status === 'pending' || htlc.status === 'locked') && now > htlc.timelock) {
      htlc.status = 'expired';
      htlcs.set(id, htlc);
      expired.push(htlc);
    }
  });

  return expired;
}
