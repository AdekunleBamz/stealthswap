import { motion } from 'framer-motion';
import { Shield, EyeOff, TrendingUp } from 'lucide-react';
import { getPrivacyScoreColor, getPrivacyScoreLabel } from '../utils/format';

interface PrivacyMeterProps {
  score: number;
}

export function PrivacyMeter({ score }: PrivacyMeterProps) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const factors = [
    { 
      label: 'Amount Hidden', 
      value: true, 
      icon: EyeOff,
      description: 'ZK commitment conceals amount'
    },
    { 
      label: 'Identity Protected', 
      value: true, 
      icon: Shield,
      description: 'No on-chain address link'
    },
    { 
      label: 'Timelock Variance', 
      value: score > 60, 
      icon: TrendingUp,
      description: 'Non-standard timing'
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="gradient-border p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-privacy-500/20">
          <Shield className="w-5 h-5 text-privacy-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Privacy Score</h3>
          <p className="text-sm text-gray-400" title="Heuristic UX indicator based on timelock, amount entropy, and timing factors. Not a formal anonymity metric.">
            Swap anonymity level <span className="text-gray-500 cursor-help">ⓘ</span>
          </p>
        </div>
      </div>

      {/* Circular Progress */}
      <div className="flex justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="64"
              cy="64"
              r="45"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-700"
            />
            {/* Progress circle */}
            <motion.circle
              cx="64"
              cy="64"
              r="45"
              stroke="url(#privacyGradient)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              style={{
                strokeDasharray: circumference,
              }}
            />
            <defs>
              <linearGradient id="privacyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className={`text-3xl font-bold ${getPrivacyScoreColor(score)}`}
            >
              {score}
            </motion.span>
            <span className="text-xs text-gray-400">/ 100</span>
          </div>
        </div>
      </div>

      {/* Score Label */}
      <div className="text-center mb-6">
        <span className={`text-lg font-semibold ${getPrivacyScoreColor(score)}`}>
          {getPrivacyScoreLabel(score)} Privacy
        </span>
      </div>

      {/* Privacy Factors */}
      <div className="space-y-3">
        {factors.map((factor) => (
          <div
            key={factor.label}
            className={`flex items-center gap-3 p-3 rounded-lg ${
              factor.value 
                ? 'bg-green-500/10 border border-green-500/20' 
                : 'bg-gray-800 border border-gray-700'
            }`}
          >
            <factor.icon className={`w-4 h-4 ${
              factor.value ? 'text-green-400' : 'text-gray-500'
            }`} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                factor.value ? 'text-green-300' : 'text-gray-400'
              }`}>
                {factor.label}
              </p>
              <p className="text-xs text-gray-500">{factor.description}</p>
            </div>
            {factor.value ? (
              <span className="text-xs text-green-400">✓</span>
            ) : (
              <span className="text-xs text-gray-500">—</span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
