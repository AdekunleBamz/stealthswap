import { useWallet } from '../hooks/useWallet';
import { shortenAddress } from '../utils/format';
import { Shield, Wallet, LogOut } from 'lucide-react';

export function Header() {
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();

  return (
    <header className="glass border-b border-gray-700/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-btc-500 via-privacy-500 to-stark-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white">StealthSwap</h1>
              <p className="text-xs text-gray-400">Private Atomic Swaps</p>
            </div>
          </div>

          {/* Network Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-privacy-500/20 border border-privacy-500/30">
            <div className="w-2 h-2 rounded-full bg-privacy-500 animate-pulse" />
            <span className="text-sm text-privacy-300">Starknet Sepolia</span>
          </div>

          {/* Wallet Connection */}
          <div>
            {isConnected ? (
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700">
                  <span className="mono text-sm text-gray-300">
                    {shortenAddress(address || '', 6)}
                  </span>
                </div>
                <button
                  onClick={disconnect}
                  className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  title="Disconnect"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={connect}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-privacy-600 to-stark-600 hover:from-privacy-500 hover:to-stark-500 text-white font-medium transition-all disabled:opacity-50"
              >
                <Wallet className="w-5 h-5" />
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
