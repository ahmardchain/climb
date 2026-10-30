import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { erc20Abi } from 'viem'
import { Users, User } from 'lucide-react'
import { CATEGORIES, CHAIN_ID, ESCROW_ADDRESS, MIN_CREATE, USDC_ADDRESS } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { formatUsdc, parseAmount } from '@/onchain-money'
import { useWalletInfo } from '@/hooks/useClimbData'
import { useClimbTx, type TxStep } from '@/hooks/useClimbTx'
import { Btn, Sheet, TxStatus, fmtUsdc } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function parseReward(value: string): bigint | null {
  if (!/^\d*\.?\d*$/.test(value) || value === '' || value === '.') return null
  try {
    return parseAmount(CHAIN_ID, value).raw
  } catch {
    return null
  }
}

export function CreateSheet({ open, onClose, onCreated }: Props) {
  const { isConnected } = useAccount()
  const { setOpen: openConnect } = useModal()
  const { data: wallet } = useWalletInfo()
  const { state, run, reset, busy } = useClimbTx()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('')
  const [reward, setReward] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const raw = parseReward(reward)
  const balance = wallet?.balance ?? 0n
  const feeBps = wallet?.feeBps ?? 0
  const titleOk = title.trim().length > 0 && title.trim().length <= 120
  const amountOk = raw !== null && raw >= MIN_CREATE
  const enough = raw !== null && (!isConnected || balance >= raw)

  let hint: string | null = null
  if (reward && raw === null) hint = 'Enter a valid amount with up to 6 decimals.'
  else if (raw !== null && raw < MIN_CREATE) hint = 'The minimum reward is 1 USDC.'
  else if (raw !== null && isConnected && !enough) hint = `You have ${fmtUsdc(balance)} USDC. Get test USDC from the Arc Studio sidebar.`

  const submit = async () => {
    if (!isConnected) return openConnect(true)
    if (!ESCROW_ADDRESS || raw === null) return
    const steps: TxStep[] = []
    if ((wallet?.allowance ?? 0n) < raw) {
      steps.push({ label: 'Approve USDC', address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ESCROW_ADDRESS, raw] })
    }
    steps.push({
      label: 'Create bounty',
      address: ESCROW_ADDRESS,
      abi: climbEscrowAbi,
      functionName: 'createBounty',
      args: [title.trim(), description.trim(), category, raw, isOpen],
    })
    const ok = await run('Post bounty', steps)
    if (ok) {
      setTitle('')
      setDescription('')
      setCategory('')
      setReward('')
      onCreated()
    }
  }

  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const needsApproval = raw !== null && (wallet?.allowance ?? 0n) < raw

  return (
    <Sheet open={open} onClose={close} label="Post a bounty">
      <h2 className="display mb-4 text-2xl font-bold">Post a bounty</h2>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bounty type">
          {[
            { open: false, label: 'Solo', sub: 'You pick the winner', icon: User },
            { open: true, label: 'Open', sub: 'Friends chip in and vote', icon: Users },
          ].map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={isOpen === o.open}
              onClick={() => setIsOpen(o.open)}
              className={`min-h-16 rounded-2xl border p-3 text-left transition-all ${
                isOpen === o.open ? 'border-[var(--accent)] bg-surface shadow-sm' : 'border-transparent bg-surface/40'
              }`}
            >
              <o.icon className="mb-1 size-4" />
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-[11px] text-[var(--muted)]">{o.sub}</div>
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Title</span>
          <input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Run 5km before sunrise"
            className="glass-inner min-h-12 w-full rounded-2xl px-4 text-sm outline-none focus:border-[var(--accent-hover)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">What counts as proof?</span>
          <textarea
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Post a photo of your watch showing time and distance."
            className="glass-inner w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none focus:border-[var(--accent-hover)]"
          />
        </label>

        <div>
          <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Category</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(category === c ? '' : c)}
                className={`min-h-10 rounded-full px-3.5 text-xs font-semibold ${category === c ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'glass-inner'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-inner rounded-2xl p-4">
          <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Reward</span>
          <input
            inputMode="decimal"
            value={reward}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (/^\d*\.?\d*$/.test(v)) setReward(v)
            }}
            placeholder="0.00"
            className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-[var(--subtle)]">USDC</span>
            {isConnected && balance > 0n && (
              <button onClick={() => setReward(formatUsdc(balance))} className="font-semibold text-[var(--accent-hover)]">
                Balance {fmtUsdc(balance)} · Max
              </button>
            )}
          </div>
        </div>

        {hint && <p className="text-xs text-[var(--danger)]">{hint}</p>}

        <p className="text-xs text-[var(--muted)]">
          Your reward is held in escrow. A {(feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 1)}% fee is taken only when it's paid out. Cancelling and refunds are free.
        </p>

        <TxStatus state={state} onDismiss={reset} />

        <Btn full busy={busy} disabled={isConnected && (!titleOk || !amountOk || !enough)} onClick={submit}>
          {!isConnected ? 'Connect wallet' : needsApproval ? 'Approve USDC, then post' : 'Post bounty'}
        </Btn>
        {state.phase === 'success' && (
          <Btn full tone="ghost" onClick={close}>
            Back to bounties
          </Btn>
        )}
      </div>
    </Sheet>
  )
}
