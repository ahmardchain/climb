import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { erc20Abi } from 'viem'
import { CHAIN_ID, ESCROW_ADDRESS, MIN_CONTRIBUTE, USDC_ADDRESS } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { parseAmount } from '@/onchain-money'
import type { WalletInfo } from '@/hooks/useClimbData'
import type { TxStep } from '@/hooks/useClimbTx'
import { Btn, fmtUsdc } from '@/components/ui'

export type Runner = (title: string, steps: TxStep[]) => Promise<boolean>

interface BaseProps {
  bountyId: bigint
  run: Runner
  busy: boolean
}

export function ContributeForm({ bountyId, run, busy, wallet }: BaseProps & { wallet?: WalletInfo }) {
  const { isConnected } = useAccount()
  const { setOpen } = useModal()
  const [amount, setAmount] = useState('')

  let raw: bigint | null = null
  if (/^\d*\.?\d+$|^\d+\.$/.test(amount)) {
    try {
      raw = parseAmount(CHAIN_ID, amount).raw
    } catch {
      raw = null
    }
  }
  const balance = wallet?.balance ?? 0n
  let hint: string | null = null
  if (amount && raw === null) hint = 'Enter a valid amount.'
  else if (raw !== null && raw < MIN_CONTRIBUTE) hint = 'The minimum contribution is 0.10 USDC.'
  else if (raw !== null && isConnected && raw > balance) hint = `You have ${fmtUsdc(balance)} USDC.`

  const submit = async () => {
    if (!isConnected) return setOpen(true)
    if (!ESCROW_ADDRESS || raw === null) return
    const steps: TxStep[] = []
    if ((wallet?.allowance ?? 0n) < raw) {
      steps.push({ label: 'Approve USDC', address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ESCROW_ADDRESS, raw] })
    }
    steps.push({ label: 'Add funds', address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: 'contribute', args: [bountyId, raw] })
    if (await run('Add to the reward', steps)) setAmount('')
  }

  const valid = raw !== null && raw >= MIN_CONTRIBUTE && (!isConnected || raw <= balance)
  return (
    <div className="space-y-2">
      <div className="glass-inner flex items-center gap-2 rounded-2xl px-4 py-2">
        <input
          inputMode="decimal"
          aria-label="Amount in USDC"
          value={amount}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, '')
            if (/^\d*\.?\d*$/.test(v)) setAmount(v)
          }}
          placeholder="0.00"
          className="display min-w-0 flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-slate-300"
        />
        <span className="text-xs font-medium text-[var(--subtle)]">USDC</span>
      </div>
      {hint && <p className="text-xs text-[var(--danger)]">{hint}</p>}
      <Btn full tone="mint" busy={busy} disabled={isConnected && !valid} onClick={submit}>
        {!isConnected ? 'Connect wallet' : raw !== null && (wallet?.allowance ?? 0n) < raw ? 'Approve and add funds' : 'Add funds'}
      </Btn>
    </div>
  )
}

export function ClaimForm({ bountyId, run, busy }: BaseProps) {
  const { isConnected } = useAccount()
  const { setOpen } = useModal()
  const [proof, setProof] = useState('')
  const [note, setNote] = useState('')

  const trimmed = proof.trim()
  const urlOk = /^https?:\/\/\S+$/i.test(trimmed) && trimmed.length <= 512

  const submit = async () => {
    if (!isConnected) return setOpen(true)
    if (!ESCROW_ADDRESS || !urlOk) return
    const ok = await run('Submit claim', [
      { label: 'Submit proof', address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: 'submitClaim', args: [bountyId, trimmed, note.trim()] },
    ])
    if (ok) {
      setProof('')
      setNote('')
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={proof}
        onChange={(e) => setProof(e.target.value)}
        placeholder="https://link-to-your-photo-video-or-post"
        inputMode="url"
        aria-label="Proof link"
        className="glass-inner min-h-12 w-full rounded-2xl px-4 text-sm outline-none"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Add a short note (optional)"
        aria-label="Note"
        className="glass-inner w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
      />
      {trimmed && !urlOk && <p className="text-xs text-[var(--danger)]">Paste a link that starts with https://</p>}
      <Btn full tone="pop" busy={busy} disabled={isConnected && !urlOk} onClick={submit}>
        {isConnected ? 'Submit proof' : 'Connect wallet'}
      </Btn>
    </div>
  )
}
