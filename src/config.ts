/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import type { EIP1193Provider } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { arc, arcTestnet } from 'viem/chains'
import { CHAIN } from '@/lib/climb'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(CHAIN.id, CHAIN.rpcUrls.default.http[0])

interface BitgetWindow {
  bitkeep?: { ethereum?: EIP1193Provider }
  ethereum?: EIP1193Provider & { isBitKeep?: boolean; isBitget?: boolean }
}

// Bitget Wallet exposes its provider at window.bitkeep.ethereum, and only sometimes at window.ethereum.
// Other wallets can take over window.ethereum, so look for Bitget explicitly.
const bitget = injected({
  target: {
    id: 'bitget',
    name: 'Bitget Wallet',
    provider: (w) => {
      const win = w as unknown as BitgetWindow
      if (win.bitkeep?.ethereum) return win.bitkeep.ethereum
      if (win.ethereum?.isBitKeep || win.ethereum?.isBitget) return win.ethereum
      return undefined
    },
  },
})

// 429s and 5xx are retried with exponential backoff (400ms, 800ms, 1.6s, ...).
const RETRY = { retryCount: 5, retryDelay: 400 }

export const config = createConfig({
  chains: [CHAIN, mainnet], // mainnet needed for ENS resolution
  // injected() covers MetaMask and any other wallet announced through EIP-6963.
  connectors: [injected(), bitget],
  // Reads issued in the same moment are combined into one multicall request.
  batch: { multicall: { wait: 25 } },
  transports: {
    [arc.id]: http(arc.rpcUrls.default.http[0], RETRY),
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0], RETRY),
    [mainnet.id]: http(undefined, RETRY), // ENS resolution uses mainnet
  },
})
