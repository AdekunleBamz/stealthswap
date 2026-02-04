import { Contract, hash, RpcProvider } from 'starknet';
import contractClass from '../../../contracts/target/dev/stealthswap_StealthSwap.contract_class.json';

const STEALTHSWAP_ADDRESS = '0x058acc5b4ef9d1c65f5672f2174f01c62bd9bdc318e99d093d4b3ca71b56bdfc';

// Fallback RPC for fetching receipts when wallet provider fails
const FALLBACK_RPC_URL = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo';

const ABI = (contractClass as any).abi;

function getProvider(starknet: any) {
  return (
    starknet?.provider ||
    starknet?.account?.provider ||
    starknet
  );
}

export function getStealthSwapContract(starknet: any) {
  const providerOrAccount = starknet?.account || getProvider(starknet);
  return new Contract(ABI, STEALTHSWAP_ADDRESS, providerOrAccount);
}

export async function initiateOnchainSwap(
  starknet: any,
  params: {
    participant: string;
    amountHash: string;
    hashlock: string;
    timelock: number;
  }
) {
  console.log('initiateOnchainSwap called with:', params);
  console.log('starknet object:', starknet);
  console.log('starknet.account:', starknet?.account);
  
  const contract = getStealthSwapContract(starknet);
  console.log('Contract created:', contract.address);
  
  try {
    // Ensure hashlock fits in felt252 range
    const safeHashlock = toFelt252(params.hashlock);
    console.log('Using safe hashlock:', safeHashlock);
    
    const tx = await contract.initiate_swap(
      params.participant,
      params.amountHash,
      safeHashlock,
      params.timelock
    );
    
    console.log('Transaction result:', tx);

    const txHash = (tx as any)?.transaction_hash || (tx as any)?.hash || (tx as any);
    console.log('Transaction hash:', txHash);
    
    // Don't wait for swap ID - just return tx hash immediately
    // The swap ID can be resolved later if needed
    return { txHash, swapId: undefined };
  } catch (error: any) {
    console.error('Contract call failed:', error);
    console.error('Error message:', error?.message);
    console.error('Error data:', error?.data);
    throw error;
  }
}

export async function lockOnchainSwap(
  starknet: any,
  swapId: string,
  proof: { amount_commitment: string; nullifier: string; proof_hash: string }
) {
  console.log('lockOnchainSwap called with:');
  console.log('  swapId:', swapId);
  console.log('  proof:', proof);
  
  const contract = getStealthSwapContract(starknet);
  
  // Try passing the struct as an object with named fields
  const proofStruct = {
    amount_commitment: proof.amount_commitment,
    nullifier: proof.nullifier,
    proof_hash: proof.proof_hash,
  };
  
  console.log('Calling lock_swap with struct:', proofStruct);
  
  const tx = await contract.lock_swap(swapId, proofStruct);
  const txHash = (tx as any)?.transaction_hash || (tx as any)?.hash || (tx as any);
  return { txHash };
}

export async function completeOnchainSwap(starknet: any, swapId: string, preimage: string) {
  const contract = getStealthSwapContract(starknet);
  const tx = await contract.complete_swap(swapId, preimage);
  const txHash = (tx as any)?.transaction_hash || (tx as any)?.hash || (tx as any);
  return { txHash };
}

export async function refundOnchainSwap(starknet: any, swapId: string) {
  const contract = getStealthSwapContract(starknet);
  const tx = await contract.refund_swap(swapId);
  const txHash = (tx as any)?.transaction_hash || (tx as any)?.hash || (tx as any);
  return { txHash };
}

export async function getSwapIdFromTx(starknet: any, txHash: string) {
  try {
    const provider = getProvider(starknet);
    
    // Try wallet provider first
    if (provider?.getTransactionReceipt) {
      try {
        if (provider?.waitForTransaction) {
          await provider.waitForTransaction(txHash);
        }
        const receipt = await provider.getTransactionReceipt(txHash);
        const swapId = parseSwapIdFromReceipt(receipt);
        if (swapId) return swapId;
      } catch (e) {
        console.log('Wallet provider failed, trying fallback RPC...');
      }
    }

    // Fallback: use direct RPC provider
    const fallbackProvider = new RpcProvider({ nodeUrl: FALLBACK_RPC_URL });
    const receipt = await fallbackProvider.getTransactionReceipt(txHash);
    return parseSwapIdFromReceipt(receipt);
  } catch (error) {
    console.log('Could not get swap ID from tx receipt:', error);
    return undefined;
  }
}

// Get the latest swap ID for the current user from the contract
export async function getLatestUserSwapId(starknet: any, userAddress: string): Promise<string | undefined> {
  try {
    const contract = getStealthSwapContract(starknet);
    const swaps = await contract.get_user_swaps(userAddress);
    if (swaps && swaps.length > 0) {
      // Return the most recent swap ID
      return swaps[swaps.length - 1].toString();
    }
  } catch (error) {
    console.error('Failed to get user swaps:', error);
  }
  return undefined;
}

// Get swap details from the contract
export async function getSwapFromContract(_starknet: any, swapId: string): Promise<any | undefined> {
  try {
    // Use fallback RPC provider for reliable reads
    const provider = new RpcProvider({ nodeUrl: FALLBACK_RPC_URL });
    const contract = new Contract(ABI, STEALTHSWAP_ADDRESS, provider);
    
    const swap = await contract.get_swap(swapId);
    console.log('Raw swap from contract:', swap);
    
    // Handle BigInt conversion properly
    const toHex = (val: any) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'bigint') return '0x' + val.toString(16);
      if (typeof val === 'string') return val.toLowerCase();
      return val.toString();
    };
    
    // Handle status enum
    let statusNum = 0;
    if (swap.status?.variant) {
      if (swap.status.variant.Pending !== undefined) statusNum = 0;
      else if (swap.status.variant.Locked !== undefined) statusNum = 1;
      else if (swap.status.variant.Completed !== undefined) statusNum = 2;
      else if (swap.status.variant.Refunded !== undefined) statusNum = 3;
      else if (swap.status.variant.Expired !== undefined) statusNum = 4;
    } else if (typeof swap.status === 'number' || typeof swap.status === 'bigint') {
      statusNum = Number(swap.status);
    }
    
    return {
      id: toHex(swap.id),
      initiator: toHex(swap.initiator),
      participant: toHex(swap.participant),
      amount_hash: toHex(swap.amount_hash),
      hashlock: toHex(swap.hashlock),
      timelock: Number(swap.timelock),
      status: statusNum,
      created_at: Number(swap.created_at),
    };
  } catch (error) {
    console.error('Failed to get swap from contract:', error);
  }
  return undefined;
}

export function parseSwapIdFromReceipt(receipt: any) {
  const selector = hash.getSelectorFromName('SwapInitiated');
  const events = receipt?.events || [];
  const match = events.find((event: any) => event?.keys?.[0] === selector);
  return match?.keys?.[1];
}

export function randomFelt() {
  // Use 31 bytes (62 hex chars) to fit safely in felt252 (max 2^252-1)
  const buf = new Uint8Array(31);
  crypto.getRandomValues(buf);
  return `0x${Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function getStarknetTxUrl(txHash: string) {
  // Ensure the hash is properly padded to 64 hex chars (+ 0x prefix)
  let hash = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
  hash = hash.padStart(64, '0');
  return `https://sepolia.voyager.online/tx/0x${hash}`;
}

// Truncate a hex string to fit within felt252 (max 2^252-1)
// felt252 can hold up to 252 bits = 63 hex characters
export function toFelt252(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Take first 63 hex characters (252 bits) to fit in felt252
  const truncated = clean.length > 63 ? clean.slice(0, 63) : clean;
  return '0x' + truncated;
}
