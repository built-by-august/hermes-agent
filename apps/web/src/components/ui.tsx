import type { ReactNode } from 'react'

/** Reusable severity/status pill. Class is derived from the value for styling. */
export function Badge({ value, children }: { value: string; children?: ReactNode }) {
  const cls = `badge badge--${value.replace(/[^a-z0-9]/gi, '_')}`
  return <span className={cls}>{children ?? value.replace(/_/g, ' ')}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="alert alert--error" role="alert">
      {message}
    </div>
  )
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="muted" aria-live="polite">
      {label ?? 'Loading…'}
    </div>
  )
}
