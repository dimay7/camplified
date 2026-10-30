// The same small helpers the agents mod has; each mod installs on its own, so
// each carries its copy.

export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

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

/** 0.4s, 12.8s, 1:41: a call's length at a glance. */
export const seconds = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : clock(ms))

export const esc = (text: string) => text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
