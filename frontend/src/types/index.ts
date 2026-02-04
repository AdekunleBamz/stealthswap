export interface HTLC {
  id: string;
  sender: string;
  receiver: string;
  amount: string;
  hashlock: string;
  timelock: number;
  status: HTLCStatus;
  createdAt: number;
  txid?: string;
}

export type HTLCStatus = 'pending' | 'locked' | 'completed' | 'refunded' | 'expired';

export interface Swap {
  id: string;
  btcHtlc: HTLC;
  starknetSwapId?: string;
  starknetTxHash?: string;
  starknetAmountCommitment?: string;
  starknetTimelock?: number;
  status: SwapStatus;
  privacyScore: number;
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

export interface SwapInitResponse {
  success: boolean;
  swap: Swap;
  preimage: string;
  hashlock: string;
  amountProof: AmountProof;
  starknetParams: {
    participant: string;
    amountHash: string;
    hashlock: string;
    timelock: number;
  };
  message: string;
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  chainId?: string;
  starknet?: any;
}
