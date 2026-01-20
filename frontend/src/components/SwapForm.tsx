import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownUp, Lock, Zap, AlertCircle } from 'lucide-react';
import { useSwapStore } from '../store/swapStore';
import { useWallet } from '../hooks/useWallet';
import { initiateSwap } from '../utils/api';
import toast from 'react-hot-toast';

export function SwapForm() {
  const { addSwap, setPreimage, setLoading, isLoading } = useSwapStore();
  const { address, isConnected } = useWallet();
  
  const [btcAmount, setBtcAmount] = useState('');
  const [btcAddress, setBtcAddress] = useState('');
  const [timelockMinutes, setTimelockMinutes] = useState(60);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!btcAmount || parseFloat(btcAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    
    try {
      // Convert BTC to satoshis
      const satoshis = Math.floor(parseFloat(btcAmount) * 100_000_000).toString();
      
      const response = await initiateSwap({
        senderBtcAddress: btcAddress || 'bc1q_mock_address',
        receiverStarknetAddress: address,
        btcAmount: satoshis,
        timelockMinutes,
      });

      if (response.success) {
        addSwap(response.swap);
        setPreimage(response.preimage);
        
        toast.success('Swap initiated! BTC HTLC created.', {
          icon: '🔒',
          duration: 5000,
        });
        
        // Reset form
        setBtcAmount('');
        setBtcAddress('');
      } else {
        toast.error('Failed to initiate swap');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to initiate swap');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="gradient-border p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-btc-500/20">
          <ArrowDownUp className="w-5 h-5 text-btc-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">New Swap</h2>
          <p className="text-sm text-gray-400">Initiate a private BTC → Starknet swap</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* BTC Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            BTC Amount
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.00000001"
              min="0"
              value={btcAmount}
              onChange={(e) => setBtcAmount(e.target.value)}
              placeholder="0.00000000"
              className="w-full px-4 py-3 pr-16 rounded-lg bg-gray-800 border border-gray-700 text-white mono placeholder-gray-500 focus:outline-none focus:border-btc-500 focus:ring-1 focus:ring-btc-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-btc-400 font-medium">
              BTC
            </span>
          </div>
        </div>

        {/* BTC Address (Optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Your BTC Address <span className="text-gray-500">(optional for testnet)</span>
          </label>
          <input
            type="text"
            value={btcAddress}
            onChange={(e) => setBtcAddress(e.target.value)}
            placeholder="bc1q..."
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white mono placeholder-gray-500 focus:outline-none focus:border-gray-600"
          />
        </div>

        {/* Timelock */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Time Lock Duration
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[30, 60, 120, 240].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setTimelockMinutes(mins)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  timelockMinutes === mins
                    ? 'bg-privacy-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {mins < 60 ? `${mins}m` : `${mins / 60}h`}
              </button>
            ))}
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-privacy-500/10 border border-privacy-500/20">
          <Lock className="w-5 h-5 text-privacy-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-privacy-300 font-medium">Zero-Knowledge Privacy</p>
            <p className="text-gray-400 mt-1">
              Your swap amount will be hidden using a ZK commitment. Only the hashlock is revealed on-chain.
            </p>
          </div>
        </div>

        {/* Warning if not connected */}
        {!isConnected && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-300">
              Connect your Starknet wallet to continue
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !isConnected}
          className="w-full py-4 rounded-lg bg-gradient-to-r from-btc-500 via-privacy-500 to-stark-500 text-white font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating Swap...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Initiate Private Swap
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
