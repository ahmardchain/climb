import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { link } from '@/lib/router'
import { Status } from '@/lib/climb'
import { usePaidAmounts, type BountyListItem } from '@/hooks/useClimbData'
import { TypeBadge, fmtUsdc } from '@/components/ui'

export function BountyCard({ item, note }: { item: BountyListItem; note?: string }) {
  const { bounty, claimCount } = item
  const paidAmounts = usePaidAmounts()
  const paid = bounty.status === Status.Paid
  // After a payout totalFunds is zero onchain, so a paid bounty shows what was paid out (gross reward).
  const amount = paid ? paidAmounts.get(bounty.id.toString()) : bounty.totalFunds
  return (
    <motion.a
      {...link(`/bounty/${bounty.id}`)}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card block rounded-3xl p-4 transition-transform active:scale-[0.99]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TypeBadge isOpen={bounty.isOpen} />
          {bounty.category && <span className="tag tag-sky">{bounty.category}</span>}
          {paid && <span className="tag tag-mint uppercase tracking-[0.08em]">Paid</span>}
        </div>
        <span className="text-xs text-[var(--subtle)]">
          {claimCount.toString()} {claimCount === 1n ? 'claim' : 'claims'}
        </span>
      </div>
      <h3 className="display text-balance text-lg font-semibold leading-snug">{bounty.title}</h3>
      <div className="mt-3 flex items-end justify-between">
        <div className="flex items-baseline gap-1.5">
          <TokenUSDC variant="branded" size={20} className="self-center" />
          <span className="display text-2xl font-bold tabular-nums">{amount === undefined ? '—' : fmtUsdc(amount)}</span>
          <span className="text-xs font-medium text-[var(--subtle)]">USDC</span>
          {note && <span className="ml-1 text-xs font-semibold text-[var(--pop-ink)]">{note}</span>}
        </div>
        <ChevronRight className="size-5 text-[var(--subtle)]" />
      </div>
    </motion.a>
  )
}
