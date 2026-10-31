import { useRef, useState } from 'react'
import { Camera, Check, Image as ImageIcon, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react'
import { IMAGE_ACCEPT } from '@/lib/upload'
import type { ImageUpload } from '@/hooks/useImageUpload'
import { Btn } from '@/components/ui'

export function ImagePicker({ upload }: { upload: ImageUpload }) {
  const browseRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const onFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) upload.pick(f)
  }
  const inputProps = {
    type: 'file' as const,
    accept: IMAGE_ACCEPT,
    className: 'hidden',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiles(e.target.files)
      e.target.value = ''
    },
  }

  if (upload.previewUrl) {
    return (
      <div className="space-y-2">
        <div className="glass-inner relative overflow-hidden rounded-2xl">
          <img src={upload.previewUrl} alt="Selected proof preview" className="max-h-64 w-full object-contain" />
          {(upload.status === 'uploading' || upload.status === 'signing') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 px-4 text-center text-sm font-semibold text-white" role="status">
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" /> {upload.status === 'signing' ? 'Confirm the signature in your wallet…' : 'Uploading…'}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-xs">
            {upload.status === 'signing' && <span className="text-[var(--muted)]">Waiting for your signature (free, no gas)…</span>}
            {upload.status === 'uploading' && <span className="text-[var(--muted)]">Uploading to IPFS…</span>}
            {upload.status === 'done' && (
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--success)' }}>
                <Check className="size-3.5" /> Uploaded
              </span>
            )}
            {upload.status === 'error' && <span className="text-[var(--danger)]">{upload.error}</span>}
          </span>
          <div className="flex shrink-0 gap-1.5">
            {upload.status === 'error' && (
              <Btn small tone="ghost" onClick={upload.retry}>
                <RefreshCw className="size-3.5" /> Retry
              </Btn>
            )}
            <Btn small tone="ghost" onClick={() => browseRef.current?.click()}>
              Replace
            </Btn>
            <Btn small tone="ghost" onClick={upload.clear} aria-label="Remove image">
              <Trash2 className="size-3.5" /> Remove
            </Btn>
          </div>
        </div>
        <input ref={browseRef} {...inputProps} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          onFiles(e.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed transition-colors ${dragging ? 'border-[var(--pop)] bg-surface/60' : 'border-[var(--inner-border)]'}`}
      >
        <button
          type="button"
          onClick={() => browseRef.current?.click()}
          className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl px-4 py-5 text-center"
        >
          <UploadCloud className="size-6 text-[var(--subtle)]" />
          <span className="text-sm font-semibold">
            <span className="hidden md:inline">Drag an image here, or click to browse</span>
            <span className="md:hidden">Add a photo as proof</span>
          </span>
          <span className="text-xs text-[var(--muted)]">JPG, PNG, WebP or GIF · up to 10 MB</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <Btn tone="ghost" onClick={() => cameraRef.current?.click()}>
          <Camera className="size-4" /> Take photo
        </Btn>
        <Btn tone="ghost" onClick={() => browseRef.current?.click()}>
          <ImageIcon className="size-4" /> Gallery
        </Btn>
      </div>
      {upload.status === 'error' && upload.error && <p className="text-xs text-[var(--danger)]">{upload.error}</p>}
      <input ref={browseRef} {...inputProps} />
      <input ref={cameraRef} {...inputProps} capture="environment" />
    </div>
  )
}
