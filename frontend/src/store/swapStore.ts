import { create } from 'zustand';
import { Swap, WalletState } from '../types';

interface SwapStore {
  // Swaps
  swaps: Swap[];
  activeSwap: Swap | null;
  preimage: string | null;
  
  // Wallet
  wallet: WalletState;
  
  // UI
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setSwaps: (swaps: Swap[]) => void;
  addSwap: (swap: Swap) => void;
  setActiveSwap: (swap: Swap | null) => void;
  setPreimage: (preimage: string | null) => void;
  setWallet: (wallet: WalletState) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateSwapStatus: (swapId: string, status: Swap['status']) => void;
}

export const useSwapStore = create<SwapStore>((set) => ({
  // Initial state
  swaps: [],
  activeSwap: null,
  preimage: null,
  wallet: {
    address: null,
    isConnected: false,
  },
  isLoading: false,
  error: null,
  
  // Actions
  setSwaps: (swaps) => set({ swaps }),
  
  addSwap: (swap) => set((state) => ({ 
    swaps: [swap, ...state.swaps],
    activeSwap: swap
  })),
  
  setActiveSwap: (swap) => set({ activeSwap: swap }),
  
  setPreimage: (preimage) => set({ preimage }),
  
  setWallet: (wallet) => set({ wallet }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error }),
  
  updateSwapStatus: (swapId, status) => set((state) => ({
    swaps: state.swaps.map((s) => 
      s.id === swapId ? { ...s, status } : s
    ),
    activeSwap: state.activeSwap?.id === swapId 
      ? { ...state.activeSwap, status } 
      : state.activeSwap
  })),
}));
