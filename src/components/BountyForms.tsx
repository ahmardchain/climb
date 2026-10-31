import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { erc20Abi } from 'viem'
import { CHAIN_ID, ESCROW_ADDRESS, MIN_CONTRIBUTE, USDC_ADDRESS } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import { parseAmount } from '@/onchain-money'
import type { WalletInfo } from '@/hooks/useClimbData'
import type { TxStep } from '@/hooks/useClimbTx'
import { Loader2 } from 'lucide-react'
import { useImageUpload } from '@/hooks/useImageUpload'
import { Btn, fmtUsdc } from '@/components/ui'
import { ImagePicker } from '@/components/ImagePicker'
import { NOTE_MAX_BYTES, TITLE_MAX_CHARS, encodeNote, noteBytes } from '@/components/ClaimNote'

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
  const upload = useImageUpload(() => setOpen(true))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const bytes = noteBytes(title, description)
  const titleOk = title.trim().length > 0 && title.trim().length <= TITLE_MAX_CHARS
  const noteOk = bytes <= NOTE_MAX_BYTES
  const ready = upload.status === 'done' && !!upload.cid && titleOk && noteOk

  const submit = async () => {
    if (!isConnected) return setOpen(true)
    if (!ESCROW_ADDRESS || !ready || !upload.cid) return
    const ok = await run('Submit claim', [
      {
        label: 'Submit proof',
        address: ESCROW_ADDRESS,
        abi: climbEscrowAbi,
        functionName: 'submitClaim',
        args: [bountyId, `ipfs://${upload.cid}`, encodeNote(title, description)],
      },
    ])
    if (ok) {
      upload.clear()
      setTitle('')
      setDescription('')
    }
  }

  let label = 'Submit claim'
  if (!isConnected) label = 'Connect wallet'
  else if (upload.status === 'signing') label = 'Waiting for signature…'
  else if (upload.status === 'uploading') label = 'Uploading…'
  else if (upload.status !== 'done') label = 'Add an image to continue'
  else if (!titleOk) label = 'Add a title to continue'

  return (
    <div className="space-y-3">
      <ImagePicker upload={upload} />
      <label className="block">
        <span className="mb-1 flex justify-between text-xs font-semibold text-[var(--muted)]">
          Claim title
          <span className="tabular-nums text-[var(--subtle)]">
            {title.length}/{TITLE_MAX_CHARS}
          </span>
        </span>
        <input
          value={title}
          maxLength={TITLE_MAX_CHARS}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Finished the 5km before sunrise"
          className="glass-inner min-h-12 w-full rounded-2xl px-4 text-sm outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">Description (optional, links welcome)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Tell the story, or paste a link to a post or video."
          className="glass-inner w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
        />
        <span className={`mt-1 block text-right text-xs tabular-nums ${noteOk ? 'text-[var(--subtle)]' : 'text-[var(--danger)]'}`}>
          {bytes}/{NOTE_MAX_BYTES} bytes
        </span>
      </label>
      {!noteOk && <p className="text-xs text-[var(--danger)]">Shorten the title or description. Claims are limited to {NOTE_MAX_BYTES} bytes.</p>}
      <Btn full tone="pop" busy={busy} disabled={isConnected && !ready} onClick={submit}>
        {(upload.status === 'uploading' || upload.status === 'signing') && <Loader2 className="size-4 animate-spin" />}
        {label}
      </Btn>
    </div>
  )
}
