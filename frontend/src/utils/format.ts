export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatBTC(satoshis: string | number): string {
  const sats = typeof satoshis === 'string' ? parseInt(satoshis) : satoshis;
  return (sats / 100_000_000).toFixed(8);
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
    case 'initiated':
      return 'text-yellow-400';
    case 'locked':
    case 'btc_locked':
    case 'starknet_locked':
      return 'text-blue-400';
    case 'completed':
      return 'text-green-400';
    case 'refunded':
    case 'failed':
      return 'text-red-400';
    case 'expired':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
}

export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'pending':
    case 'initiated':
      return 'bg-yellow-500/20 border-yellow-500/30';
    case 'locked':
    case 'btc_locked':
    case 'starknet_locked':
      return 'bg-blue-500/20 border-blue-500/30';
    case 'completed':
      return 'bg-green-500/20 border-green-500/30';
    case 'refunded':
    case 'failed':
      return 'bg-red-500/20 border-red-500/30';
    case 'expired':
      return 'bg-gray-500/20 border-gray-500/30';
    default:
      return 'bg-gray-500/20 border-gray-500/30';
  }
}

export function getPrivacyScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

export function getPrivacyScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Moderate';
  return 'Low';
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
