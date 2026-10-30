import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, ExternalLink, ImageOff, Link2, Loader2, X } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'
import { CHAIN_ID, classifyProof } from '@/lib/climb'
import type { TxState } from '@/hooks/useClimbTx'

export function fmtUsdc(raw: bigint): string {
  const s = formatUsdc(raw)
  if (!s.includes('.')) return `${s}.00`
  const frac = s.split('.')[1]
  return frac.length === 1 ? `${s}0` : s
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

type Tone = 'primary' | 'ghost' | 'mint' | 'danger' | 'pop'

const TONES: Record<Tone, string> = {
  primary: 'bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110',
  ghost: 'bg-surface/70 text-[var(--ink)] border border-surface/80 hover:bg-surface',
  mint: 'bg-[var(--mint)] text-white hover:brightness-110',
  danger: 'bg-[var(--danger)] text-white hover:brightness-110',
  pop: 'bg-[var(--pop)] text-white hover:brightness-110',
}

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: () => unknown
  tone?: Tone
  busy?: boolean
  full?: boolean
  small?: boolean
}

export function Btn({ tone = 'primary', busy, full, small, className = '', children, disabled, onClick, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      onClick={() => {
        void onClick?.()
      }}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
        small ? 'min-h-9 px-3.5 py-1.5 text-xs' : 'min-h-12 px-5 py-3 text-sm'
      } ${full ? 'w-full' : ''} ${TONES[tone]} ${className}`}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function TypeBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <span className={`tag uppercase tracking-[0.08em] ${isOpen ? 'tag-mint' : 'tag-pop'}`}>{isOpen ? 'Open' : 'Solo'}</span>
  )
}

export function TxStatus({ state, onDismiss }: { state: TxState; onDismiss: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {state.phase !== 'idle' && (
        <motion.div
          key={state.phase}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="glass-inner relative rounded-2xl p-4 text-sm"
          role="status"
        >
          {(state.phase === 'success' || state.phase === 'error') && (
            <button onClick={onDismiss} aria-label="Dismiss" className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full text-[var(--subtle)] hover:bg-surface/70">
              <X className="size-4" />
            </button>
          )}
          {(state.phase === 'wallet' || state.phase === 'confirming') && (
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--accent-hover)]" />
              <div>
                <div className="font-semibold">{state.phase === 'wallet' ? 'Confirm in your wallet' : 'Waiting for confirmation'}</div>
                <div className="text-xs text-[var(--muted)]">
                  {state.title}
                  {state.stepCount > 1 ? ` · step ${state.stepIndex + 1} of ${state.stepCount}` : ''}
                  {state.step ? ` · ${state.step}` : ''}
                </div>
              </div>
            </div>
          )}
          {state.phase === 'success' && (
            <div className="flex items-start gap-3 pr-8">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--mint)] text-white">
                <Check className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[var(--success)]">{state.title}: done</div>
                <div className="mt-1 flex flex-col gap-1">
                  {state.hashes.map((h, i) => (
                    <a
                      key={h}
                      href={buildTxExplorerUrl(CHAIN_ID, h)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-hover)] underline-offset-2 hover:underline"
                    >
                      View transaction{state.hashes.length > 1 ? ` ${i + 1}` : ''} on explorer <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
          {state.phase === 'error' && (
            <div className="flex items-start gap-3 pr-8">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" />
              <div>
                <div className="font-semibold">{state.title} didn't go through</div>
                <div className="text-xs text-[var(--muted)]">{state.error}</div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            role="dialog"
            aria-label={label}
            className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl"
            style={{ background: 'var(--sheet-bg)', backdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)' }} />
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>
            <div className="px-5 pb-8 pt-2">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ProofPreview({ uri }: { uri: string }) {
  const [broken, setBroken] = useState(false)
  const { kind, url } = classifyProof(uri)

  if (kind === 'invalid' || !url) {
    return (
      <div className="glass-inner flex items-center gap-2 rounded-2xl p-3 text-xs text-[var(--muted)]">
        <Link2 className="size-4 shrink-0" />
        <span className="break-all">{uri}</span>
      </div>
    )
  }
  if (kind === 'image' && !broken) {
    return (
      <a href={url.href} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-surface/70 bg-surface/50">
        <img src={url.href} alt="Proof submitted by the claimant" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="max-h-72 w-full object-cover" />
      </a>
    )
  }
  if (kind === 'video') {
    return <video src={url.href} controls preload="metadata" className="max-h-72 w-full rounded-2xl bg-black/5" />
  }
  return (
    <a href={url.href} target="_blank" rel="noopener noreferrer" className="glass-inner flex min-h-12 items-center gap-3 rounded-2xl p-3 hover:bg-surface/80">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-[var(--accent-hover)]">
        {kind === 'image' ? <ImageOff className="size-4" /> : <Link2 className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{url.hostname}</span>
        <span className="block truncate text-xs text-[var(--muted)]">{url.href}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-[var(--subtle)]" />
    </a>
  )
}
