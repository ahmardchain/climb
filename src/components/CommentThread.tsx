import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { ESCROW_ADDRESS } from '@/lib/climb'
import { climbEscrowAbi } from '@/lib/climbAbi'
import type { ChainEvent } from '@/lib/eventStore'
import { Btn, useNow } from '@/components/ui'
import { PersonLink, timeAgo } from '@/components/shared'
import type { Runner } from '@/components/BountyForms'

interface Props {
  bountyId: bigint
  events: ChainEvent[]
  run: Runner
  busy: boolean
}

export function CommentThread({ bountyId, events, run, busy }: Props) {
  const { address, isConnected } = useAccount()
  const { setOpen } = useModal()
  const now = useNow(30_000)
  const [text, setText] = useState('')

  const comments = useMemo(
    () => events.filter((e) => e.name === 'CommentAdded' && e.args.bountyId === bountyId),
    [events, bountyId],
  )

  const trimmed = text.trim()
  const submit = async () => {
    if (!isConnected) return setOpen(true)
    if (!ESCROW_ADDRESS || !trimmed) return
    const ok = await run('Post comment', [
      { label: 'Post comment', address: ESCROW_ADDRESS, abi: climbEscrowAbi, functionName: 'addComment', args: [bountyId, trimmed] },
    ])
    if (ok) setText('')
  }

  return (
    <section>
      <h2 className="display mb-3 text-lg font-semibold">
        Comments <span className="text-[var(--subtle)]">({comments.length})</span>
      </h2>
      {comments.length > 0 && (
        <ul className="mb-3 space-y-2.5">
          {comments.map((c) => (
            <li key={`${c.txHash}-${c.logIndex}`} className="glass-card rounded-2xl p-3.5 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <PersonLink address={String(c.args.author)} me={address} />
                <span className="text-xs text-[var(--subtle)]">{timeAgo(c.ts, now)}</span>
              </div>
              <p className="whitespace-pre-line text-pretty break-words">{String(c.args.text)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="glass-card space-y-2 rounded-2xl p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={2}
          aria-label="Write a comment"
          placeholder="Say something nice"
          className="glass-inner w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs tabular-nums text-[var(--subtle)]">{text.length}/500</span>
          <Btn small busy={busy} disabled={isConnected && !trimmed} onClick={submit}>
            {isConnected ? 'Post comment' : 'Connect wallet'}
          </Btn>
        </div>
      </div>
    </section>
  )
}
