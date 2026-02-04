import { motion } from 'framer-motion';
import { useState } from 'react';
import { Clock, CheckCircle2, XCircle, Lock, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { hash } from 'starknet';
import { Swap } from '../types';
import { useCountdown } from '../hooks/useCountdown';
import { useSwapStore } from '../store/swapStore';
import { formatBTC, getStatusColor, getStatusBgColor, shortenAddress, copyToClipboard } from '../utils/format';
import { completeOnchainSwap, getLatestUserSwapId, getStarknetTxUrl, getSwapFromContract, getSwapIdFromTx, initiateOnchainSwap, lockOnchainSwap, randomFelt, refundOnchainSwap } from '../utils/starknet';
import { getSwap, linkStarknetSwap, resolveStarknetSwapId, updateSwapStatus as updateSwapStatusApi } from '../utils/api';
import { useWallet } from '../hooks/useWallet';
import toast from 'react-hot-toast';

interface SwapStatusProps {
  swap: Swap;
}

export function SwapStatus({ swap }: SwapStatusProps) {
  const { preimage, starknetPreimage, setStarknetPreimage, updateSwapStatus, updateSwap } = useSwapStore();
  const { starknet, address } = useWallet();
  const { formatted, isExpired, hours, minutes, seconds } = useCountdown(swap.btcHtlc.timelock);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number) => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  };

  const handleRetryStarknetInit = async () => {
    if (!starknet || !address) {
      toast.error('Connect your Starknet wallet first');
      return;
    }

    setIsRetrying(true);
    try {
      // Try to fetch fresh swap data from backend, but fall back to local data
      let amountHash = swap.starknetAmountCommitment;
      let hashlock = swap.btcHtlc.hashlock;
      // ALWAYS use a future timelock (1 hour from now + 5 min safety margin)
      let timelock = Math.floor(Date.now() / 1000) + 3600 + 300;

      try {
        const backendSwap = await getSwap(swap.id);
        if (backendSwap.success) {
          amountHash = backendSwap.starknet?.amountCommitment || amountHash;
          hashlock = backendSwap.starknet?.hashlock || backendSwap.btc?.hashlock || hashlock;
          // Only use backend timelock if it's still in the future
          const backendTimelock = backendSwap.starknet?.timelockTimestamp;
          if (backendTimelock && backendTimelock > Math.floor(Date.now() / 1000) + 60) {
            timelock = backendTimelock;
          }
        }
      } catch (e) {
        console.log('Backend fetch failed, using local swap data');
      }

      // Generate amountHash if missing (for demo purposes)
      if (!amountHash) {
        const { computePoseidonHashOnElements } = await import('starknet').then(m => ({ computePoseidonHashOnElements: m.hash.computePoseidonHashOnElements }));
        const blindingFactor = randomFelt();
        // Amount is already in satoshis
        const amountSats = typeof swap.btcHtlc.amount === 'number' ? swap.btcHtlc.amount : (parseInt(swap.btcHtlc.amount) || 100000);
        amountHash = computePoseidonHashOnElements([amountSats.toString(), blindingFactor]);
        console.log('Generated amountHash:', amountHash);
      }

      // Generate hashlock if missing
      if (!hashlock) {
        hashlock = randomFelt();
        console.log('Generated hashlock:', hashlock);
      }

      console.log('Initiating Starknet swap with:', { participant: address, amountHash, hashlock, timelock });

      const onchain = await initiateOnchainSwap(starknet, {
        participant: address,
        amountHash,
        hashlock: hashlock.startsWith('0x') ? hashlock : `0x${hashlock}`,
        timelock,
      });

      console.log('Starknet initiate result:', onchain);

      updateSwap(swap.id, {
        starknetTxHash: onchain.txHash,
        starknetSwapId: onchain.swapId,
        starknetAmountCommitment: amountHash,
        starknetTimelock: timelock,
      });

      if (onchain.swapId) {
        await linkStarknetSwap(swap.id, onchain.swapId, onchain.txHash);
      }

      toast.success('Starknet swap initiated!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to initiate on Starknet');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    copyToClipboard(text);
    toast.success(`${label} copied to clipboard`);
  };

  const resolveSwapId = async () => {
    if (swap.starknetSwapId) return swap.starknetSwapId;
    if (!starknet) return undefined;

    // Prefer: resolve via backend (avoids browser CORS)
    if (swap.starknetTxHash) {
      try {
        const resolved = await resolveStarknetSwapId(swap.id, swap.starknetTxHash);
        if (resolved?.swapId) {
          updateSwap(swap.id, { starknetSwapId: resolved.swapId });
          return resolved.swapId;
        }
      } catch (error) {
        console.error('Failed to resolve swap ID via backend:', error);
      }
    }

    // Fallback: get latest swap ID for this user from contract
    if (address) {
      try {
        const latestSwapId = await getLatestUserSwapId(starknet, address);
        if (latestSwapId) {
          updateSwap(swap.id, { starknetSwapId: latestSwapId });
          return latestSwapId;
        }
      } catch (error) {
        console.error('Failed to resolve swap ID via contract:', error);
      }
    }

    // Last resort: try tx receipt directly
    if (swap.starknetTxHash) {
      try {
        const resolved = await getSwapIdFromTx(starknet, swap.starknetTxHash);
        if (resolved) {
          updateSwap(swap.id, { starknetSwapId: resolved });
          return resolved;
        }
      } catch (error) {
        console.error('Failed to resolve swap ID via tx receipt:', error);
      }
    }

    return undefined;
  };

  const handleLockOnStarknet = async () => {
    if (!starknet) {
      toast.error('Connect your Starknet wallet first');
      return;
    }

    if (!swap.starknetTxHash) {
      toast.error('Initiate the Starknet swap first');
      return;
    }

    setIsLocking(true);
    toast.loading('Resolving swap ID from transaction...', { id: 'lock-loading' });

    let swapId: string | undefined;
    try {
      // Wait longer for tx confirmation - up to 30 seconds
      swapId = await withTimeout(resolveSwapId(), 30000);
    } catch (error) {
      toast.dismiss('lock-loading');
      toast.error('Transaction still pending. Wait 30 seconds for confirmation, then try again.');
      setIsLocking(false);
      return;
    }

    if (!swapId || !swap.starknetAmountCommitment) {
      toast.dismiss('lock-loading');
      toast.error('Waiting for Starknet confirmation. Try again in a minute.');
      setIsLocking(false);
      return;
    }

    toast.dismiss('lock-loading');

    try {
      // Get the actual amount_hash from the contract to ensure it matches
      const contractSwap = await getSwapFromContract(starknet, swapId);
      console.log('Contract swap data:', contractSwap);
      
      if (!contractSwap) {
        toast.error('Could not read swap from contract');
        setIsLocking(false);
        return;
      }

      if (contractSwap.status !== 0) {
        toast.error(`Swap is not pending (status: ${contractSwap.status})`);
        setIsLocking(false);
        return;
      }

      // Use the amount_hash from the contract, not the local value
      const amountCommitment = contractSwap.amount_hash;
      console.log('Using amount_hash from contract:', amountCommitment);

      const nullifier = randomFelt();
      const proofHash = hash.computePoseidonHashOnElements([
        amountCommitment,
        nullifier,
      ]);

      await lockOnchainSwap(starknet, swapId, {
        amount_commitment: amountCommitment,
        nullifier,
        proof_hash: proofHash,
      });

      updateSwapStatus(swap.id, 'starknet_locked');
      
      // Also update backend status
      try {
        await updateSwapStatusApi(swap.id, 'starknet_locked', {
          starknetTxHash: swap.starknetTxHash,
          starknetSwapId: swapId,
        });
      } catch (e) {
        console.log('Backend status update failed (non-critical):', e);
      }
      
      toast.success('Swap locked on Starknet');
    } catch (error) {
      console.error(error);
      toast.error('Failed to lock on Starknet');
    } finally {
      setIsLocking(false);
    }
  };

  const handleComplete = async () => {
    if (!starknet) {
      toast.error('Connect your Starknet wallet first');
      return;
    }

    const swapId = await resolveSwapId();
    if (!swapId) {
      toast.error('Missing Starknet swap ID');
      return;
    }

    console.log('=== Complete Swap Debug ===');
    console.log('preimage from store:', preimage);
    console.log('starknetPreimage from store:', starknetPreimage);

    // Use starknetPreimage (Poseidon-compatible) if available, otherwise fall back to preimage
    let preimageToUse = starknetPreimage || preimage;
    
    // If no preimage in store, try to fetch from backend
    if (!preimageToUse && swap.id) {
      console.log('No preimage in store, fetching from backend...');
      try {
        const swapDetails = await getSwap(swap.id);
        if (swapDetails?.secrets?.starknetPreimage) {
          preimageToUse = swapDetails.secrets.starknetPreimage;
          setStarknetPreimage(preimageToUse);
          console.log('Recovered starknetPreimage from backend:', preimageToUse);
        } else if (swapDetails?.secrets?.preimage) {
          // Generate starknetPreimage from raw preimage
          const rawPreimage = swapDetails.secrets.preimage;
          preimageToUse = '0x' + rawPreimage.replace('0x', '').slice(0, 62);
          setStarknetPreimage(preimageToUse);
          console.log('Generated starknetPreimage from raw preimage:', preimageToUse);
        }
      } catch (err) {
        console.error('Failed to fetch preimage from backend:', err);
      }
    }
    
    if (!preimageToUse) {
      toast.error('Missing preimage. Check if it was saved during swap initiation.');
      return;
    }

    try {
      // First, verify the preimage matches the hashlock
      const contractSwap = await getSwapFromContract(starknet, swapId);
      console.log('Contract swap for complete:', contractSwap);
      
      if (contractSwap?.status !== 1) {
        toast.error(`Swap is not locked (status: ${contractSwap?.status})`);
        return;
      }

      const preimageFelt = preimageToUse.startsWith('0x') ? preimageToUse : `0x${preimageToUse}`;
      
      // Verify hash matches - normalize both to lowercase for comparison
      // Note: felt252 can only hold 252 bits (63 hex chars), so hashes may be truncated
      const computedHash = hash.computePoseidonHashOnElements([preimageFelt]);
      const contractHashlock = contractSwap?.hashlock || '';
      
      // Truncate computed hash to match felt252 storage (63 hex chars max after 0x)
      const truncateToFelt = (h: string) => {
        const hex = h.replace('0x', '');
        return '0x' + (hex.length > 63 ? hex.slice(0, 63) : hex);
      };
      
      const normalizedComputed = truncateToFelt(computedHash).toLowerCase();
      const normalizedExpected = truncateToFelt(contractHashlock).toLowerCase();
      
      console.log('Preimage being used:', preimageFelt);
      console.log('Computed hash (full):', computedHash);
      console.log('Contract hashlock:', contractHashlock);
      console.log('Normalized computed (truncated):', normalizedComputed);
      console.log('Normalized expected (truncated):', normalizedExpected);
      console.log('Match:', normalizedComputed === normalizedExpected);
      
      if (normalizedComputed !== normalizedExpected) {
        console.error('Hash mismatch! The preimage does not match the hashlock.');
        console.error('This may indicate the preimage was not saved correctly during initiation.');
        toast.error('Preimage verification failed. Hash does not match.');
        return;
      }

      await completeOnchainSwap(starknet, swapId, preimageFelt);
      updateSwapStatus(swap.id, 'completed');
      
      // Also update backend status
      try {
        await updateSwapStatusApi(swap.id, 'completed', {
          starknetTxHash: swap.starknetTxHash,
          starknetSwapId: swapId,
        });
      } catch (e) {
        console.log('Backend status update failed (non-critical):', e);
      }
      
      toast.success('Swap completed on Starknet');
    } catch (error) {
      console.error('Complete swap error:', error);
      toast.error('Failed to complete swap');
    }
  };

  const handleRefund = async () => {
    if (!starknet) {
      toast.error('Connect your Starknet wallet first');
      return;
    }

    const swapId = await resolveSwapId();
    if (!swapId) {
      toast.error('Missing Starknet swap ID');
      return;
    }

    try {
      await refundOnchainSwap(starknet, swapId);
      updateSwapStatus(swap.id, 'refunded');
      toast.success('Swap refunded on Starknet');
    } catch (error) {
      console.error(error);
      toast.error('Failed to refund swap');
    }
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
      <div className="flex flex-wrap gap-3 mt-6">
        {swap.starknetTxHash ? (
          <>
            <a
              href={getStarknetTxUrl(swap.starknetTxHash)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-3 rounded-lg bg-stark-600 hover:bg-stark-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View on Starknet
            </a>
            {!swap.starknetSwapId ? (
              <div className="w-full text-center text-sm text-yellow-400 mt-2">
                ⏳ Waiting for transaction confirmation... (check Voyager for status)
              </div>
            ) : (
              <div className="w-full text-center text-sm text-green-400 mt-2">
                ✅ Transaction confirmed on L2
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleRetryStarknetInit}
            disabled={isRetrying}
            className="flex-1 py-3 rounded-lg bg-stark-600 hover:bg-stark-500 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Initiating...' : 'Init on Starknet'}
          </button>
        )}

        {['initiated', 'btc_locked'].includes(swap.status) && swap.starknetAmountCommitment && swap.starknetTxHash && (
          <button
            onClick={handleLockOnStarknet}
            disabled={isLocking}
            className="flex-1 py-3 rounded-lg bg-privacy-600 hover:bg-privacy-500 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            {isLocking ? 'Locking...' : 'Lock on Starknet'}
          </button>
        )}

        {swap.status === 'starknet_locked' && !isExpired && (
          <button
            onClick={handleComplete}
            className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Complete Swap
          </button>
        )}

        {isExpired && swap.status !== 'completed' && (
          <button
            onClick={handleRefund}
            className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Refund
          </button>
        )}
      </div>
    </motion.div>
  );
}
