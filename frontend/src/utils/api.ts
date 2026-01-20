const API_BASE = '/api';

export async function initiateSwap(data: {
  senderBtcAddress: string;
  receiverStarknetAddress: string;
  btcAmount: string;
  timelockMinutes: number;
}) {
  const response = await fetch(`${API_BASE}/swap/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function getSwap(swapId: string) {
  const response = await fetch(`${API_BASE}/swap/${swapId}`);
  return response.json();
}

export async function getAllSwaps() {
  const response = await fetch(`${API_BASE}/swap`);
  return response.json();
}

export async function linkStarknetSwap(swapId: string, starknetSwapId: string) {
  const response = await fetch(`${API_BASE}/swap/${swapId}/link-starknet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ starknetSwapId }),
  });
  return response.json();
}

export async function createHTLC(data: {
  sender: string;
  receiver: string;
  amount: string;
  hashlock: string;
  timelockMinutes: number;
}) {
  const response = await fetch(`${API_BASE}/htlc/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function lockHTLC(htlcId: string) {
  const response = await fetch(`${API_BASE}/htlc/${htlcId}/lock`, {
    method: 'POST',
  });
  return response.json();
}

export async function completeHTLC(htlcId: string, preimage: string) {
  const response = await fetch(`${API_BASE}/htlc/${htlcId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preimage }),
  });
  return response.json();
}

export async function generatePreimage() {
  const response = await fetch(`${API_BASE}/htlc/generate/preimage`);
  return response.json();
}

export async function generateProof(amount: string) {
  const response = await fetch(`${API_BASE}/proof/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  return response.json();
}

export async function checkHealth() {
  const response = await fetch('/health');
  return response.json();
}
