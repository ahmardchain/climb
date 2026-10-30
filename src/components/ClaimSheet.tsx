import { useClimbTx } from '@/hooks/useClimbTx'
import { Sheet, TxStatus } from '@/components/ui'
import { ClaimForm } from '@/components/BountyForms'

/** "Create claim" from the bottom nav on a bounty page. Contract rules (creator or funder) surface as friendly errors. */
export function ClaimSheet({ open, onClose, bountyId }: { open: boolean; onClose: () => void; bountyId: bigint }) {
  const { state, run, reset, busy } = useClimbTx()
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} label="Create claim">
      <h2 className="display mb-1 text-2xl font-bold">Create claim</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">Share a link to your photo, video or post as proof that you did it.</p>
      <div className="space-y-3">
        <ClaimForm bountyId={bountyId} run={run} busy={busy} />
        <TxStatus state={state} onDismiss={reset} />
      </div>
    </Sheet>
  )
}
