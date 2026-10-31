import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { uploadMessage } from '../../api/_lib/auth'
import { isUserRejection } from '@/lib/climb'
import { UploadError, uploadImage, validateImage, type UploadAuth } from '@/lib/upload'

export type UploadStatus = 'idle' | 'signing' | 'uploading' | 'done' | 'error'

export interface ImageUpload {
  file: File | null
  previewUrl: string | null
  status: UploadStatus
  cid: string | null
  error: string | null
  pick: (file: File) => void
  retry: () => void
  clear: () => void
}

/** A signature is reused for a few minutes so replacing an image doesn't mean signing again. */
const REUSE_SECONDS = 240

/**
 * Picks an image, shows a local preview, asks the wallet to sign a short message, then uploads.
 * The CID is set once the upload finishes.
 */
export function useImageUpload(onNeedWallet?: () => void): ImageUpload {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [cid, setCid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const authRef = useRef<UploadAuth | null>(null)

  const getAuth = useCallback(async (): Promise<UploadAuth> => {
    if (!address) throw new UploadError('Connect your wallet to upload your image.', 'no_wallet')
    const now = Math.floor(Date.now() / 1000)
    const cached = authRef.current
    if (cached && cached.address.toLowerCase() === address.toLowerCase() && now - cached.timestamp < REUSE_SECONDS) return cached
    const signature = await signMessageAsync({ message: uploadMessage(address, now) })
    const fresh = { address, timestamp: now, signature }
    authRef.current = fresh
    return fresh
  }, [address, signMessageAsync])

  const start = useCallback(
    (f: File) => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setError(null)
      setCid(null)
      void (async () => {
        try {
          setStatus('signing')
          const auth = await getAuth()
          if (ctrl.signal.aborted) return
          setStatus('uploading')
          const result = await uploadImage(f, auth, ctrl.signal)
          if (ctrl.signal.aborted) return
          setCid(result)
          setStatus('done')
        } catch (err) {
          if (ctrl.signal.aborted) return
          if (err instanceof UploadError && (err.code === 'auth' || err.code === 'signature_expired')) authRef.current = null
          if (err instanceof UploadError && err.code === 'no_wallet') onNeedWallet?.()
          setError(
            isUserRejection(err)
              ? 'Signature cancelled. Sign the message to upload your image.'
              : err instanceof Error
                ? err.message
                : 'The upload failed. Try again.',
          )
          setStatus('error')
        }
      })()
    },
    [getAuth, onNeedWallet],
  )

  const clear = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u)
      return null
    })
    setFile(null)
    setCid(null)
    setError(null)
    setStatus('idle')
  }, [])

  const pick = useCallback(
    (f: File) => {
      const problem = validateImage(f)
      if (problem) {
        clear()
        setError(problem)
        setStatus('error')
        return
      }
      setPreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return URL.createObjectURL(f)
      })
      setFile(f)
      start(f)
    },
    [clear, start],
  )

  const retry = useCallback(() => {
    if (file) start(file)
  }, [file, start])

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  return { file, previewUrl, status, cid, error, pick, retry, clear }
}
