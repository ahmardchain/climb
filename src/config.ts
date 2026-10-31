/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import type { EIP1193Provider } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

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

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  // injected() covers MetaMask and any other wallet announced through EIP-6963.
  connectors: [injected(), bitget],
  transports: {
    [arcTestnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
