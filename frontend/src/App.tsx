import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';
import { SwapForm } from './components/SwapForm';
import { SwapStatus } from './components/SwapStatus';
import { SwapHistory } from './components/SwapHistory';
import { PrivacyMeter } from './components/PrivacyMeter';
import { useSwapStore } from './store/swapStore';

function App() {
  const { activeSwap } = useSwapStore();

  return (
    <div className="min-h-screen">
      <Toaster 
        position="top-right"
        toastOptions={{
          className: 'glass text-white',
          style: {
            background: 'rgba(30, 41, 59, 0.95)',
            color: '#fff',
            border: '1px solid rgba(168, 85, 247, 0.3)',
          },
        }}
      />
      
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="text-btc-500">BTC</span>
              <span className="text-gray-400 mx-3">↔</span>
              <span className="text-stark-500">Starknet</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Privacy-preserving atomic swaps powered by{' '}
              <span className="text-privacy-400">zero-knowledge proofs</span>
            </p>
          </div>

          {/* Main Grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column - Swap Form */}
            <div className="lg:col-span-2 space-y-6">
              <SwapForm />
              {activeSwap && <SwapStatus swap={activeSwap} />}
            </div>

            {/* Right Column - Privacy & History */}
            <div className="space-y-6">
              {activeSwap && (
                <PrivacyMeter score={activeSwap.privacyScore} />
              )}
              <SwapHistory />
            </div>
          </div>

          {/* Tech Stack Footer */}
          <div className="mt-16 text-center">
            <p className="text-sm text-gray-500 mb-4">Powered by</p>
            <div className="flex justify-center items-center gap-8 text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-btc-500">₿</span>
                <span>Bitcoin</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-stark-500">◆</span>
                <span>Starknet</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-privacy-500">🔒</span>
                <span>ZK-STARKs</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
