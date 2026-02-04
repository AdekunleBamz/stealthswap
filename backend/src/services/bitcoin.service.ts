import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import axios from 'axios';
import crypto from 'crypto';

// Initialize libraries
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// Bitcoin Testnet network
const TESTNET = bitcoin.networks.testnet;

// Blockstream Testnet API
const BLOCKSTREAM_API =
  process.env.BLOCKSTREAM_API_BASE || 'https://blockstream.info/testnet/api';
const BLOCKSTREAM_API_KEY = process.env.BLOCKSTREAM_API_KEY;

let cachedBlockHeight = 0;
let lastHeightFetchMs = 0;
const HEIGHT_CACHE_TTL_MS = 30_000;
let lastHeightErrorMs = 0;
const HEIGHT_ERROR_COOLDOWN_MS = 5 * 60_000;

export interface BitcoinWallet {
  address: string;
  privateKey: string;
  publicKey: string;
  wif: string;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
  };
}

export interface HTLCParams {
  recipientPubKey: Buffer;
  senderPubKey: Buffer;
  hashlock: Buffer;
  timelock: number; // Block height
}

/**
 * Generate a new Bitcoin testnet wallet
 */
export function generateWallet(): BitcoinWallet {
  const keyPair = ECPair.makeRandom({ network: TESTNET });
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: TESTNET,
  });

  return {
    address: address!,
    privateKey: keyPair.privateKey!.toString('hex'),
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    wif: keyPair.toWIF(),
  };
}

/**
 * Generate wallet from mnemonic
 */
export function walletFromMnemonic(mnemonic: string, index: number = 0): BitcoinWallet {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, TESTNET);
  const path = `m/84'/1'/0'/0/${index}`; // BIP84 testnet path
  const child = root.derivePath(path);
  
  const keyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey!));
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: TESTNET,
  });

  return {
    address: address!,
    privateKey: Buffer.from(child.privateKey!).toString('hex'),
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    wif: keyPair.toWIF(),
  };
}

/**
 * Generate a random preimage and its SHA256 hash (hashlock)
 * Note: This is for Bitcoin HTLC. For Starknet, use generateStarknetHashlock()
 */
export function generateHashlock(): { preimage: string; hashlock: string } {
  const preimage = crypto.randomBytes(32);
  const hashlock = crypto.createHash('sha256').update(preimage).digest();
  
  return {
    preimage: preimage.toString('hex'),
    hashlock: hashlock.toString('hex'),
  };
}

/**
 * Generate a random preimage as a felt252-safe hex string (31 bytes)
 * Returns just the preimage - the hashlock should be computed on-chain or via starknet.js
 */
export function generateStarknetPreimage(): string {
  // Use 31 bytes (248 bits) to fit safely in felt252
  const preimage = crypto.randomBytes(31);
  return '0x' + preimage.toString('hex');
}

/**
 * Compute SHA256 hash of a preimage
 */
export function computeHashlock(preimage: string): string {
  const preimageBuffer = Buffer.from(preimage, 'hex');
  return crypto.createHash('sha256').update(preimageBuffer).digest('hex');
}

/**
 * Fetch UTXOs for an address from Blockstream API
 */
export async function getUTXOs(address: string): Promise<UTXO[]> {
  try {
    const response = await axios.get(`${BLOCKSTREAM_API}/address/${address}/utxo`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch UTXOs:', error);
    return [];
  }
}

/**
 * Get address balance
 */
export async function getBalance(address: string): Promise<number> {
  const utxos = await getUTXOs(address);
  return utxos.reduce((sum, utxo) => sum + utxo.value, 0);
}

/**
 * Get current block height
 */
export async function getBlockHeight(): Promise<number> {
  try {
    const now = Date.now();
    if (lastHeightErrorMs && now - lastHeightErrorMs < HEIGHT_ERROR_COOLDOWN_MS) {
      return cachedBlockHeight || 0;
    }
    if (cachedBlockHeight > 0 && now - lastHeightFetchMs < HEIGHT_CACHE_TTL_MS) {
      return cachedBlockHeight;
    }

    const response = await axios.get(`${BLOCKSTREAM_API}/blocks/tip/height`, {
      headers: BLOCKSTREAM_API_KEY ? { 'x-api-key': BLOCKSTREAM_API_KEY } : undefined,
    });
    cachedBlockHeight = response.data;
    lastHeightFetchMs = now;
    return cachedBlockHeight;
  } catch (error) {
    lastHeightErrorMs = Date.now();
    const status = (error as any)?.response?.status;
    if (status !== 429) {
      console.error('Failed to fetch block height:', error);
    }
    return cachedBlockHeight || 0;
  }
}

/**
 * Fetch transaction details
 */
export async function getTransaction(txid: string): Promise<any> {
  try {
    const response = await axios.get(`${BLOCKSTREAM_API}/tx/${txid}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch transaction:', error);
    return null;
  }
}

/**
 * Broadcast a raw transaction to the network
 */
export async function broadcastTransaction(txHex: string): Promise<string> {
  try {
    const response = await axios.post(`${BLOCKSTREAM_API}/tx`, txHex, {
      headers: { 'Content-Type': 'text/plain' },
    });
    return response.data; // Returns txid
  } catch (error: any) {
    console.error('Failed to broadcast transaction:', error.response?.data || error.message);
    throw new Error(error.response?.data || 'Failed to broadcast transaction');
  }
}

/**
 * Create an HTLC redeem script
 * 
 * This script allows:
 * 1. Recipient to claim with preimage before timelock
 * 2. Sender to refund after timelock expires
 */
export function createHTLCScript(params: HTLCParams): Buffer {
  const { recipientPubKey, senderPubKey, hashlock, timelock } = params;
  
  const script = bitcoin.script.compile([
    bitcoin.opcodes.OP_IF,
      // Recipient claim path (with preimage)
      bitcoin.opcodes.OP_SHA256,
      hashlock,
      bitcoin.opcodes.OP_EQUALVERIFY,
      recipientPubKey,
      bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ELSE,
      // Sender refund path (after timelock)
      bitcoin.script.number.encode(timelock),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      senderPubKey,
      bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_ENDIF,
  ]);
  return Buffer.from(script);
}

/**
 * Get P2WSH address from HTLC script
 */
export function getHTLCAddress(htlcScript: Buffer): string {
  const { address } = bitcoin.payments.p2wsh({
    redeem: { output: htlcScript, network: TESTNET },
    network: TESTNET,
  });
  return address!;
}

/**
 * Create and sign an HTLC funding transaction
 */
export async function createHTLCFundingTx(
  senderWIF: string,
  htlcScript: Buffer,
  amountSats: number,
  feeRate: number = 2 // sats/vbyte
): Promise<{ txHex: string; txid: string; htlcAddress: string }> {
  const keyPair = ECPair.fromWIF(senderWIF, TESTNET);
  const senderPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: TESTNET,
  });
  
  const htlcPayment = bitcoin.payments.p2wsh({
    redeem: { output: htlcScript, network: TESTNET },
    network: TESTNET,
  });

  // Fetch UTXOs
  const utxos = await getUTXOs(senderPayment.address!);
  if (utxos.length === 0) {
    throw new Error(
      `No UTXOs found for ${senderPayment.address}\n\n` +
      `🪙 Get free testnet BTC from these faucets:\n` +
      `   • https://coinfaucet.eu/en/btc-testnet/\n` +
      `   • https://testnet-faucet.mempool.co/\n\n` +
      `💡 Check your balance at:\n` +
      `   https://blockstream.info/testnet/address/${senderPayment.address}`
    );
  }

  // Calculate inputs needed
  const estimatedSize = 150; // Rough estimate for 1-in-2-out P2WPKH tx
  const fee = feeRate * estimatedSize;
  const totalNeeded = amountSats + fee;
  
  let inputSum = 0;
  const selectedUtxos: UTXO[] = [];
  
  for (const utxo of utxos) {
    selectedUtxos.push(utxo);
    inputSum += utxo.value;
    if (inputSum >= totalNeeded) break;
  }
  
  if (inputSum < totalNeeded) {
    throw new Error(`Insufficient funds. Have ${inputSum} sats, need ${totalNeeded} sats`);
  }

  // Build transaction
  const psbt = new bitcoin.Psbt({ network: TESTNET });
  
  // Add inputs
  for (const utxo of selectedUtxos) {
    const prevTx = await getTransaction(utxo.txid);
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: senderPayment.output!,
        value: BigInt(utxo.value),
      },
    });
  }

  // Add HTLC output
  psbt.addOutput({
    script: htlcPayment.output!,
    value: BigInt(amountSats),
  });

  // Add change output if needed
  const change = inputSum - amountSats - fee;
  if (change > 546) { // Dust threshold
    psbt.addOutput({
      address: senderPayment.address!,
      value: BigInt(change),
    });
  }

  // Sign all inputs
  for (let i = 0; i < selectedUtxos.length; i++) {
    psbt.signInput(i, keyPair);
  }

  psbt.finalizeAllInputs();
  
  const tx = psbt.extractTransaction();
  
  return {
    txHex: tx.toHex(),
    txid: tx.getId(),
    htlcAddress: htlcPayment.address!,
  };
}

/**
 * Create a claim transaction (recipient claims with preimage)
 */
export async function createClaimTx(
  recipientWIF: string,
  htlcScript: Buffer,
  htlcTxid: string,
  htlcVout: number,
  htlcAmount: number,
  preimage: string,
  feeRate: number = 2
): Promise<{ txHex: string; txid: string }> {
  const keyPair = ECPair.fromWIF(recipientWIF, TESTNET);
  const recipientPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: TESTNET,
  });

  const htlcPayment = bitcoin.payments.p2wsh({
    redeem: { output: htlcScript, network: TESTNET },
    network: TESTNET,
  });

  const fee = feeRate * 200; // Estimate for witness tx
  const outputAmount = htlcAmount - fee;

  if (outputAmount <= 546) {
    throw new Error('Output amount too small after fees');
  }

  const psbt = new bitcoin.Psbt({ network: TESTNET });

  psbt.addInput({
    hash: htlcTxid,
    index: htlcVout,
    witnessUtxo: {
      script: htlcPayment.output!,
      value: BigInt(htlcAmount),
    },
    witnessScript: htlcScript,
  });

  psbt.addOutput({
    address: recipientPayment.address!,
    value: BigInt(outputAmount),
  });

  // Sign the input
  psbt.signInput(0, keyPair);

  // Finalize with custom witness (preimage + signature + OP_TRUE for IF branch)
  psbt.finalizeInput(0, (inputIndex: number, input: any) => {
    const signature = input.partialSig![0].signature;
    const preimageBuffer = Buffer.from(preimage, 'hex');
    
    return {
      finalScriptWitness: bitcoin.script.compile([
        signature,
        preimageBuffer,
        Buffer.from([0x01]), // OP_TRUE for IF branch
        htlcScript,
      ]),
    };
  });

  const tx = psbt.extractTransaction();
  
  return {
    txHex: tx.toHex(),
    txid: tx.getId(),
  };
}

/**
 * Create a refund transaction (sender refunds after timelock)
 */
export async function createRefundTx(
  senderWIF: string,
  htlcScript: Buffer,
  htlcTxid: string,
  htlcVout: number,
  htlcAmount: number,
  timelock: number,
  feeRate: number = 2
): Promise<{ txHex: string; txid: string }> {
  const keyPair = ECPair.fromWIF(senderWIF, TESTNET);
  const senderPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: TESTNET,
  });

  const htlcPayment = bitcoin.payments.p2wsh({
    redeem: { output: htlcScript, network: TESTNET },
    network: TESTNET,
  });

  const fee = feeRate * 200;
  const outputAmount = htlcAmount - fee;

  if (outputAmount <= 546) {
    throw new Error('Output amount too small after fees');
  }

  const psbt = new bitcoin.Psbt({ network: TESTNET });

  psbt.addInput({
    hash: htlcTxid,
    index: htlcVout,
    witnessUtxo: {
      script: htlcPayment.output!,
      value: BigInt(htlcAmount),
    },
    witnessScript: htlcScript,
    sequence: 0xfffffffe, // Enable locktime
  });

  psbt.addOutput({
    address: senderPayment.address!,
    value: BigInt(outputAmount),
  });

  // Set locktime
  psbt.setLocktime(timelock);

  // Sign
  psbt.signInput(0, keyPair);

  // Finalize with refund witness (signature + OP_FALSE for ELSE branch)
  psbt.finalizeInput(0, (inputIndex: number, input: any) => {
    const signature = input.partialSig![0].signature;
    
    return {
      finalScriptWitness: bitcoin.script.compile([
        signature,
        Buffer.from([]), // OP_FALSE for ELSE branch
        htlcScript,
      ]),
    };
  });

  const tx = psbt.extractTransaction();
  
  return {
    txHex: tx.toHex(),
    txid: tx.getId(),
  };
}

/**
 * Get testnet faucet info
 */
export function getTestnetFaucetInfo(): string {
  return `
Bitcoin Testnet Faucets:
1. https://coinfaucet.eu/en/btc-testnet/
2. https://testnet-faucet.mempool.co/
3. https://bitcoinfaucet.uo1.net/
4. https://tbtc.bitaps.com/

Send testnet BTC to your generated address to fund swaps.
  `.trim();
}
