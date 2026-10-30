import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Sheet } from '@/components/ui'

const SECTIONS = [
  {
    q: 'What are bounties?',
    a: [
      'A bounty is a task with a USDC reward locked in escrow by the contract. Nobody can take the money back quietly: it only moves when the bounty is paid out, withdrawn, or cancelled.',
      'There are two kinds. Solo bounties are funded by the creator, who alone picks the winner. Open bounties are crowdfunded: anyone can add USDC, and the people who funded it vote on the winner.',
    ],
  },
  {
    q: 'How do I claim one?',
    a: [
      'Open a bounty and submit a link to your proof: an image, a video, or a post. Add a short note if it helps.',
      "You can't claim a bounty you created or funded, and if you've submitted a claim you can't fund that bounty. Claims stay open while a bounty is Active or being voted on.",
    ],
  },
  {
    q: 'How do I get paid?',
    a: [
      'Solo: the creator accepts your claim and the reward is paid out right away.',
      'Open: the creator nominates a claim and a 48-hour vote starts. Every funder votes yes or no, weighted by how much USDC they put in. When the 48 hours are up, anyone can resolve the vote. More yes than no pays the claimant. Funding and withdrawals are frozen while a vote runs.',
      'If the vote fails, the bounty goes back to Active. The creator has to wait 24 hours before nominating again, which gives funders time to withdraw if they want out.',
      'A 2.5% platform fee is taken from the reward when it is paid out. Withdrawals and refunds never cost a fee. If a payout cannot be sent directly, it is parked on your profile and you can withdraw it from there.',
    ],
  },
]

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [openIdx, setOpenIdx] = useState(0)
  return (
    <Sheet open={open} onClose={onClose} label="How it works">
      <h2 className="display mb-4 text-2xl font-bold">How climb works</h2>
      <div className="space-y-2">
        {SECTIONS.map((s, i) => (
          <div key={s.q} className="glass-inner rounded-2xl">
            <button
              onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
              aria-expanded={openIdx === i}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold"
            >
              {s.q}
              <ChevronDown className={`size-4 shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} />
            </button>
            {openIdx === i && (
              <div className="space-y-2 px-4 pb-4 text-sm text-[var(--muted)]">
                {s.a.map((p) => (
                  <p key={p} className="text-pretty">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  )
}
