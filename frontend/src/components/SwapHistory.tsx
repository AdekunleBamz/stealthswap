import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { History, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useSwapStore } from '../store/swapStore';
import { getAllSwaps } from '../utils/api';
import { formatBTC, getStatusColor, shortenAddress, formatTimeRemaining } from '../utils/format';

export function SwapHistory() {
  const { swaps, setSwaps, setActiveSwap, activeSwap } = useSwapStore();

  useEffect(() => {
    const fetchSwaps = async () => {
      try {
        const response = await getAllSwaps();
        if (response.swaps) {
          // Get current state directly to avoid stale closure
          const currentSwaps = useSwapStore.getState().swaps;
          const now = Math.floor(Date.now() / 1000);
          const mappedSwaps = response.swaps.map((swap: any) => {
            const existing = currentSwaps.find((s) => s.id === swap.id);
            const blocksRemaining = typeof swap.blocksRemaining === 'number' ? swap.blocksRemaining : 0;
            const fallbackTimelock = blocksRemaining > 0
              ? now + blocksRemaining * 10 * 60
              : now + 3600;
            const amountSats = swap.btcAmount
              ? Math.floor(parseFloat(swap.btcAmount) * 100_000_000)
              : 0;
            const existingAmountRaw = existing?.btcHtlc?.amount ?? 0;
            const existingAmountSats = typeof existingAmountRaw === 'number'
              ? existingAmountRaw
              : parseInt(existingAmountRaw || '0', 10);
            const mergedAmount = existingAmountSats > 0 ? existingAmountRaw : amountSats;
            const existingTimelock = existing?.btcHtlc?.timelock ?? 0;
            const mergedTimelock = existingTimelock > now ? existingTimelock : fallbackTimelock;

            // Prioritize local status if it's further along in the flow
            const statusPriority: Record<string, number> = {
              'initiated': 1,
              'btc_locked': 2,
              'starknet_locked': 3,
              'completed': 4,
              'refunded': 4,
              'failed': 0,
            };
            const existingPriority = statusPriority[existing?.status || ''] || 0;
            const backendPriority = statusPriority[swap.status || ''] || 0;
            const mergedStatus = existingPriority >= backendPriority ? (existing?.status || swap.status) : swap.status;

            return {
              ...existing,
              id: swap.id,
              status: mergedStatus,
              privacyScore: swap.privacyScore ?? existing?.privacyScore ?? 0,
              createdAt: swap.createdAt ?? existing?.createdAt ?? Date.now(),
              // Preserve local starknet data - this is crucial!
              starknetTxHash: existing?.starknetTxHash || swap.starknetTxHash,
              starknetSwapId: existing?.starknetSwapId || swap.starknetSwapId,
              starknetAmountCommitment: existing?.starknetAmountCommitment || swap.starknetAmountCommitment,
              starknetTimelock: existing?.starknetTimelock || swap.starknetTimelock,
              btcHtlc: {
                ...existing?.btcHtlc,
                id: swap.id,
                sender: existing?.btcHtlc?.sender ?? 'testnet',
                receiver: existing?.btcHtlc?.receiver ?? 'testnet',
                amount: mergedAmount,
                hashlock: existing?.btcHtlc?.hashlock ?? swap.hashlock ?? '',
                timelock: mergedTimelock,
                status: existing?.btcHtlc?.status ?? 'pending',
                createdAt: existing?.btcHtlc?.createdAt ?? swap.createdAt ?? Date.now(),
                txid: existing?.btcHtlc?.txid || swap.txid,
              },
            };
          });

          const existingOnly = currentSwaps.filter((s) => !response.swaps.some((r: any) => r.id === s.id));
          const combined = [...mappedSwaps, ...existingOnly];
          const unique = Array.from(new Map(combined.map((s) => [s.id, s])).values());
          setSwaps(unique);
        }
      } catch (error) {
        console.error('Failed to fetch swaps:', error);
      }
    };

    fetchSwaps();
    const interval = setInterval(fetchSwaps, 10000); // Refresh every 10s

    return () => clearInterval(interval);
  }, [setSwaps]);

  if (swaps.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="gradient-border p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-gray-700">
            <History className="w-5 h-5 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Swap History</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-400">No swaps yet</p>
          <p className="text-sm text-gray-500 mt-1">Your swap history will appear here</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="gradient-border p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-700">
            <History className="w-5 h-5 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Swap History</h3>
        </div>
        <span className="text-sm text-gray-400">{swaps.length} swaps</span>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {swaps.map((swap, index) => {
          const now = Math.floor(Date.now() / 1000);
          const timeRemaining = swap.btcHtlc.timelock - now;
          const isActive = activeSwap?.id === swap.id;

          return (
            <button
              key={`${swap.id}-${index}`}
              onClick={() => setActiveSwap(swap)}
              className={`w-full p-3 rounded-lg text-left transition-all ${
                isActive 
                  ? 'bg-privacy-500/20 border border-privacy-500/30' 
                  : 'bg-gray-800/50 border border-transparent hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded ${
                    swap.status === 'completed' ? 'bg-green-500/20' : 'bg-btc-500/20'
                  }`}>
                    {swap.status === 'completed' ? (
                      <ArrowDownLeft className="w-4 h-4 text-green-400" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-btc-400" />
                    )}
                  </div>
                  <div>
                    <p className="mono text-sm text-white">
                      {formatBTC(swap.btcHtlc.amount)} BTC
                    </p>
                    <p className="text-xs text-gray-500 mono">
                      {shortenAddress(swap.id, 6)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-medium ${getStatusColor(swap.status)}`}>
                    {swap.status.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {timeRemaining > 0 
                      ? formatTimeRemaining(timeRemaining) 
                      : 'Expired'}
                  </p>
                </div>
              </div>
              
              {/* Privacy score indicator */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-privacy-500 to-stark-500 rounded-full"
                    style={{ width: `${swap.privacyScore}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{swap.privacyScore}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
