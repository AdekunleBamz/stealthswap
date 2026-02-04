import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Swap, WalletState } from '../types';

interface SwapStore {
  // Swaps
  swaps: Swap[];
  activeSwap: Swap | null;
  preimage: string | null;
  starknetPreimage: string | null;  // Starknet-compatible preimage for complete_swap
  
  // Wallet
  wallet: WalletState;
  
  // UI
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setSwaps: (swaps: Swap[] | ((prev: Swap[]) => Swap[])) => void;
  addSwap: (swap: Swap) => void;
  setActiveSwap: (swap: Swap | null) => void;
  setPreimage: (preimage: string | null) => void;
  setStarknetPreimage: (preimage: string | null) => void;
  setWallet: (wallet: WalletState) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateSwapStatus: (swapId: string, status: Swap['status']) => void;
  updateSwap: (swapId: string, updates: Partial<Swap>) => void;
}

export const useSwapStore = create<SwapStore>()(
  persist(
    (set) => ({
      // Initial state
      swaps: [],
      activeSwap: null,
      preimage: null,
      starknetPreimage: null,
      wallet: {
        address: null,
        isConnected: false,
      },
      isLoading: false,
      error: null,
      
      // Actions
      setSwaps: (swapsOrUpdater) => set((state) => ({
        swaps: typeof swapsOrUpdater === 'function' 
          ? swapsOrUpdater(state.swaps) 
          : swapsOrUpdater
      })),
      
      addSwap: (swap) => set((state) => ({ 
        swaps: [swap, ...state.swaps],
        activeSwap: swap
      })),
      
      setActiveSwap: (swap) => set({ activeSwap: swap }),
      
      setPreimage: (preimage) => set({ preimage }),
      
      setStarknetPreimage: (starknetPreimage) => set({ starknetPreimage }),
      
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

      updateSwap: (swapId, updates) => set((state) => ({
        swaps: state.swaps.map((s) => 
          s.id === swapId ? { ...s, ...updates } : s
        ),
        activeSwap: state.activeSwap?.id === swapId 
          ? { ...state.activeSwap, ...updates } 
          : state.activeSwap
      })),
    }),
    {
      name: 'stealthswap-store',
      partialize: (state) => ({
        swaps: state.swaps,
        activeSwap: state.activeSwap,
        preimage: state.preimage,
        starknetPreimage: state.starknetPreimage,
      }),
    }
  )
);
