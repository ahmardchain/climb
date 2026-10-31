import { Fragment } from 'react'

/** A claim's note holds "<title>\n<description>". Notes without a newline are plain text from older claims. */
export const NOTE_MAX_BYTES = 500
export const TITLE_MAX_CHARS = 80

export function encodeNote(title: string, description: string): string {
  return `${title.trim()}\n${description.trim()}`
}

export function noteBytes(title: string, description: string): number {
  return new TextEncoder().encode(encodeNote(title, description)).length
}

export function parseNote(note: string): { title: string; description: string } {
  const i = note.indexOf('\n')
  if (i === -1) return { title: '', description: note }
  return { title: note.slice(0, i), description: note.slice(i + 1) }
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g

/** Plain text with http(s) links made clickable. Everything else renders as text, never as markup. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const trimmed = part.replace(/[.,;:!?)]+$/, '')
          const tail = part.slice(trimmed.length)
          return (
            <Fragment key={i}>
              <a href={trimmed} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-[var(--accent-hover)] underline-offset-2 hover:underline">
                {trimmed}
              </a>
              {tail}
            </Fragment>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

export function ClaimNote({ note }: { note: string }) {
  if (!note.trim()) return null
  const { title, description } = parseNote(note)
  return (
    <div className="space-y-1">
      {title && <h4 className="display text-base font-semibold leading-snug">{title}</h4>}
      {description.trim() && (
        <p className="whitespace-pre-line text-pretty break-words text-sm text-[var(--muted)]">
          <Linkified text={description} />
        </p>
      )}
    </div>
  )
}
