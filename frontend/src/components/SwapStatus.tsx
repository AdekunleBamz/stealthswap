import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, Lock, ArrowRight, Copy, ExternalLink } from 'lucide-react';
import { Swap } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { useSwapStore } from '../store/swapStore';
import { formatBTC, getStatusColor, getStatusBgColor, shortenAddress, copyToClipboard } from '../utils/format';
import toast from 'react-hot-toast';

interface SwapStatusProps {
  swap: Swap;
}

export function SwapStatus({ swap }: SwapStatusProps) {
  const { preimage } = useSwapStore();
  const { formatted, isExpired, hours, minutes, seconds } = useCountdown(swap.btcHtlc.timelock);

  const handleCopy = (text: string, label: string) => {
    copyToClipboard(text);
    toast.success(`${label} copied to clipboard`);
  };

  const steps = [
    { 
      id: 'initiated', 
      label: 'Swap Initiated', 
      status: 'completed',
      description: 'BTC HTLC created'
    },
    { 
      id: 'btc_locked', 
      label: 'BTC Locked', 
      status: swap.status === 'initiated' ? 'current' : 'completed',
      description: 'Waiting for confirmations'
    },
    { 
      id: 'starknet_locked', 
      label: 'Starknet Verified', 
      status: ['initiated', 'btc_locked'].includes(swap.status) ? 'pending' : 
              swap.status === 'starknet_locked' ? 'current' : 'completed',
      description: 'ZK proof submitted'
    },
    { 
      id: 'completed', 
      label: 'Swap Complete', 
      status: swap.status === 'completed' ? 'completed' : 'pending',
      description: 'Funds released'
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="gradient-border p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Swap Status</h3>
          <p className="text-sm text-gray-400 mono">{shortenAddress(swap.id, 8)}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusBgColor(swap.status)} ${getStatusColor(swap.status)}`}>
          {swap.status.replace('_', ' ').toUpperCase()}
        </div>
      </div>

      {/* Timelock Countdown */}
      <div className={`p-4 rounded-lg mb-6 ${isExpired ? 'bg-red-500/20 border border-red-500/30' : 'bg-gray-800 border border-gray-700'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className={`w-5 h-5 ${isExpired ? 'text-red-400' : 'text-stark-400'}`} />
            <span className="text-sm text-gray-300">Time Lock</span>
          </div>
          <div className={`mono text-2xl font-bold ${isExpired ? 'text-red-400' : 'text-white'}`}>
            {formatted}
          </div>
        </div>
        
        {/* Time breakdown */}
        {!isExpired && (
          <div className="flex gap-4 mt-3 justify-end">
            <div className="text-center">
              <div className="text-xs text-gray-500">Hours</div>
              <div className="mono text-lg text-gray-300">{hours.toString().padStart(2, '0')}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Minutes</div>
              <div className="mono text-lg text-gray-300">{minutes.toString().padStart(2, '0')}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Seconds</div>
              <div className="mono text-lg text-gray-300">{seconds.toString().padStart(2, '0')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Progress Steps */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step.status === 'completed' ? 'bg-green-500' :
                  step.status === 'current' ? 'bg-privacy-500 animate-pulse' :
                  'bg-gray-700'
                }`}>
                  {step.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  ) : step.status === 'current' ? (
                    <div className="w-3 h-3 bg-white rounded-full" />
                  ) : (
                    <div className="w-3 h-3 bg-gray-500 rounded-full" />
                  )}
                </div>
                <span className={`text-xs mt-2 text-center max-w-[80px] ${
                  step.status === 'completed' ? 'text-green-400' :
                  step.status === 'current' ? 'text-privacy-400' :
                  'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${
                  step.status === 'completed' ? 'bg-green-500' : 'bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Swap Details */}
      <div className="space-y-3">
        <div className="flex items-center justify-between py-2 border-b border-gray-800">
          <span className="text-sm text-gray-400">Amount</span>
          <span className="mono text-white">{formatBTC(swap.btcHtlc.amount)} BTC</span>
        </div>
        
        <div className="flex items-center justify-between py-2 border-b border-gray-800">
          <span className="text-sm text-gray-400">BTC HTLC</span>
          <div className="flex items-center gap-2">
            <span className="mono text-gray-300 text-sm">{shortenAddress(swap.btcHtlc.txid || '', 6)}</span>
            <button 
              onClick={() => handleCopy(swap.btcHtlc.txid || '', 'Transaction ID')}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-gray-800">
          <span className="text-sm text-gray-400">Hashlock</span>
          <div className="flex items-center gap-2">
            <span className="mono text-gray-300 text-sm">{shortenAddress(swap.btcHtlc.hashlock, 8)}</span>
            <button 
              onClick={() => handleCopy(swap.btcHtlc.hashlock, 'Hashlock')}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preimage (secret) */}
        {preimage && (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-yellow-300 font-medium">Secret Preimage</span>
              </div>
              <button
                onClick={() => handleCopy(preimage, 'Preimage')}
                className="flex items-center gap-1 text-yellow-400 hover:text-yellow-300 text-sm"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <p className="text-xs text-yellow-200/70 mt-2">
              Keep this secret! Reveal only when completing the swap.
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mt-6">
        <button className="flex-1 py-3 rounded-lg bg-stark-600 hover:bg-stark-500 text-white font-medium transition-colors flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" />
          View on Starknet
        </button>
        {swap.status === 'starknet_locked' && !isExpired && (
          <button className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Complete Swap
          </button>
        )}
        {isExpired && swap.status !== 'completed' && (
          <button className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors flex items-center justify-center gap-2">
            <XCircle className="w-4 h-4" />
            Refund
          </button>
        )}
      </div>
    </motion.div>
  );
}
