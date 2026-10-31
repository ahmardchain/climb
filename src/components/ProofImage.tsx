import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, ImageOff, Link2, X } from 'lucide-react'
import { classifyProof } from '@/lib/climb'
import { GATEWAYS, gatewayUrl } from '@/lib/ipfs'

function sourcesFor(uri: string): string[] {
  const info = classifyProof(uri)
  const path = info.ipfs
  if (path) return GATEWAYS.map((_, i) => gatewayUrl(path, i))
  return info.url ? [info.url.href] : []
}

interface ProofImageProps {
  uri: string
  alt?: string
  className?: string
  /** Shown when every source fails to load. */
  fallback?: ReactNode
}

/** An image proof. ipfs:// links try each public gateway in turn until one loads. */
export function ProofImage(props: ProofImageProps) {
  // Keyed by uri so the gateway index resets whenever the image changes.
  return <ProofImageInner key={props.uri} {...props} />
}

function ProofImageInner({ uri, alt = '', className = '', fallback }: ProofImageProps) {
  const sources = sourcesFor(uri)
  const [idx, setIdx] = useState(0)

  const src = sources[idx]
  if (!src) {
    return (
      <>
        {fallback ?? (
          <span className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-[var(--muted)]">
            <ImageOff className="size-5" /> Image unavailable
          </span>
        )}
      </>
    )
  }
  return <img key={src} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setIdx((i) => i + 1)} className={className} />
}

export function Lightbox({ uri, onClose }: { uri: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const original = sourcesFor(uri)[0]
  return (
    <div role="dialog" aria-modal="true" aria-label="Full-size image" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
        <X className="size-5" />
      </button>
      <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <ProofImage uri={uri} alt="Proof submitted by the claimant" className="max-h-[80dvh] max-w-full rounded-xl object-contain" />
        {original && (
          <a href={original} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white">
            Open original <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}

export function ProofPreview({ uri }: { uri: string }) {
  const [open, setOpen] = useState(false)
  const info = classifyProof(uri)
  const url = info.url

  if (info.kind === 'invalid' || !url) {
    return (
      <div className="glass-inner flex items-center gap-2 rounded-2xl p-3 text-xs text-[var(--muted)]">
        <Link2 className="size-4 shrink-0" />
        <span className="break-all">{uri}</span>
      </div>
    )
  }

  const linkCard = (
    <a href={url.href} target="_blank" rel="noopener noreferrer" className="glass-inner flex min-h-12 items-center gap-3 rounded-2xl p-3 hover:bg-surface/80">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-[var(--accent-hover)]">
        {info.kind === 'image' ? <ImageOff className="size-4" /> : <Link2 className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{info.ipfs ? 'Image on IPFS' : url.hostname}</span>
        <span className="block truncate text-xs text-[var(--muted)]">{info.ipfs ? 'Could not load from the gateways. Tap to retry.' : url.href}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-[var(--subtle)]" />
    </a>
  )

  if (info.kind === 'image') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="View full-size image"
          className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-surface/70 bg-surface/50"
        >
          <ProofImage uri={uri} alt="Proof submitted by the claimant" className="max-h-72 w-full object-cover" fallback={linkCard} />
        </button>
        {open && <Lightbox uri={uri} onClose={() => setOpen(false)} />}
      </>
    )
  }
  if (info.kind === 'video') {
    return <video src={url.href} controls preload="metadata" className="max-h-72 w-full rounded-2xl bg-black/5" />
  }
  return linkCard
}
