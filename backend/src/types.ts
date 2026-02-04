export interface HTLC {
  id: string;
  sender: string;
  receiver: string;
  amount: string; // BTC amount in satoshis
  hashlock: string;
  timelock: number; // Unix timestamp
  status: HTLCStatus;
  createdAt: number;
  txid?: string; // BTC transaction ID
}

export type HTLCStatus = 'pending' | 'locked' | 'completed' | 'refunded' | 'expired';

export interface Swap {
  id: string;
  btcHtlc: HTLC;
  starknetSwapId?: string;
  status: SwapStatus;
  privacyScore: number; // 0-100
  createdAt: number;
  completedAt?: number;
}

export type SwapStatus = 'initiated' | 'btc_locked' | 'starknet_locked' | 'completed' | 'failed' | 'refunded';

export interface AmountProof {
  commitment: string;
  nullifier: string;
  proofHash: string;
  blindingFactor: string;
}

export interface SwapRequest {
  senderBtcAddress: string;
  receiverStarknetAddress: string;
  btcAmount: string;
  timelockMinutes: number;
}

export interface LockRequest {
  swapId: string;
  preimage: string;
}
