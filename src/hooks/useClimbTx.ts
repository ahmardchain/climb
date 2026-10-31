import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import type { Abi, Address } from 'viem'
import { CHAIN, CHAIN_ID, friendlyError, isUserRejection } from '@/lib/climb'

export interface TxStep {
  label: string
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export type TxPhase = 'idle' | 'wallet' | 'confirming' | 'success' | 'error'

export interface TxState {
  phase: TxPhase
  title: string
  step?: string
  stepIndex: number
  stepCount: number
  hashes: `0x${string}`[]
  error?: string
}

const IDLE: TxState = { phase: 'idle', title: '', stepIndex: 0, stepCount: 0, hashes: [] }

/** Runs one or more contract writes in order, with real wallet and receipt states. */
export function useClimbTx() {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  const [state, setState] = useState<TxState>(IDLE)

  const reset = useCallback(() => setState(IDLE), [])

  const run = useCallback(
    async (title: string, steps: TxStep[]): Promise<boolean> => {
      if (!address) {
        setState({ ...IDLE, phase: 'error', title, error: 'Connect your wallet to continue.' })
        return false
      }
      if (!publicClient) {
        setState({ ...IDLE, phase: 'error', title, error: 'Network issue. Try again in a moment.' })
        return false
      }
      const hashes: `0x${string}`[] = []
      const base = { title, stepCount: steps.length }
      try {
        if (chainId !== CHAIN_ID) {
          setState({ ...base, phase: 'wallet', step: `Switch to ${CHAIN.name}`, stepIndex: 0, hashes })
          await switchChainAsync({ chainId: CHAIN_ID })
        }
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i]
          setState({ ...base, phase: 'wallet', step: s.label, stepIndex: i, hashes: [...hashes] })
          // Simulate first so a revert surfaces as a named contract error.
          await publicClient.simulateContract({
            account: address,
            address: s.address,
            abi: s.abi,
            functionName: s.functionName,
            args: s.args,
          })
          const hash = await writeContractAsync({
            chainId: CHAIN_ID,
            address: s.address,
            abi: s.abi,
            functionName: s.functionName,
            args: s.args,
          })
          hashes.push(hash)
          setState({ ...base, phase: 'confirming', step: s.label, stepIndex: i, hashes: [...hashes] })
          const receipt = await publicClient.waitForTransactionReceipt({ hash })
          if (receipt.status !== 'success') throw new Error('reverted')
        }
        setState({ ...base, phase: 'success', stepIndex: steps.length - 1, hashes })
        await queryClient.invalidateQueries({ queryKey: ['climb'] })
        return true
      } catch (err) {
        if (isUserRejection(err)) {
          setState(IDLE)
        } else {
          setState({ ...base, phase: 'error', stepIndex: 0, hashes, error: friendlyError(err) })
        }
        return false
      }
    },
    [address, chainId, publicClient, queryClient, switchChainAsync, writeContractAsync],
  )

  return { state, run, reset, busy: state.phase === 'wallet' || state.phase === 'confirming' }
}
