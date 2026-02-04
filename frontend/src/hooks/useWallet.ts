import { useState, useEffect, useCallback } from 'react';
import { connect, disconnect } from 'get-starknet';
import { useSwapStore } from '../store/swapStore';

export function useWallet() {
  const { wallet, setWallet } = useSwapStore();
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      const starknet = await connect();
      if (starknet && starknet.isConnected) {
        const address = starknet.selectedAddress;
        setWallet({
          address: address || null,
          isConnected: true,
          chainId: starknet.chainId,
          starknet,
        });
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [setWallet]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect();
      setWallet({
        address: null,
        isConnected: false,
        starknet: undefined,
      });
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, [setWallet]);

  // Auto-reconnect on mount
  useEffect(() => {
    const autoConnect = async () => {
      try {
        const starknet = await connect({ modalMode: 'neverAsk' });
        if (starknet && starknet.isConnected) {
          setWallet({
            address: starknet.selectedAddress || null,
            isConnected: true,
            chainId: starknet.chainId,
            starknet,
          });
        }
      } catch (error) {
        // Silent fail for auto-connect
      }
    };
    autoConnect();
  }, [setWallet]);

  return {
    ...wallet,
    isConnecting,
    connect: connectWallet,
    disconnect: disconnectWallet,
  };
}
