import type { CallRecord } from '../types'

export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

// The argument that says most about a call, in the order a person would want it.
const DETAIL_KEYS = ['command', 'file_path', 'pattern', 'url', 'query', 'description', 'path', 'prompt', 'skill']

export function detailOf(input: Record<string, unknown>) {
  for (const key of DETAIL_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value) return oneLine(value)
  }
  return ''
}

/** A stopwatch reading: 0:07, 4:26, 1:02:09. */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** "4s", "52s", "1:12": how long ago, at a glance. */
export const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : clock(ms))

export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

export const callTime = (c: CallRecord) =>
  c.ms === undefined ? 'running' : c.ms < 1000 ? `${c.ms}ms` : `${(c.ms / 1000).toFixed(1)}s`
