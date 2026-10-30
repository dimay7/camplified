import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Lane } from '../types'

// This file is the only one that touches the session's stored state: the
// engine lists what a module reads and writes from atoms declared with
// literal names in the file that uses them, so the rest of the mod goes
// through the accessors below (function declarations: past an import, the
// engine follows `$` only into those).

// Change a shape tag when its value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const lanes = atom({ plugin: 'trace', key: 'lanes' } as const, {}, { shape: 'lanes-1' })
const now = atom({ plugin: 'trace', key: 'now' } as const, 0)
const window = atom({ plugin: 'trace', key: 'window' } as const, 120_000)

type $ = EngineInterface

export function readLanes($: $) {
  return read($, lanes)
}
export function updateLanes($: $, fn: (all: Record<string, Lane>) => Record<string, Lane>) {
  return update($, lanes, fn)
}
export function readNow($: $) {
  return read($, now)
}
export function setNow($: $, at: number) {
  return update($, now, () => at)
}
export function readWindow($: $) {
  return read($, window)
}
export function setWindow($: $, ms: number) {
  return update($, window, () => ms)
}

export const MAIN = 'main'
export const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])
// What one lane keeps, and how many finished lanes stay.
const KEEP_SPANS = 400
const KEEP_DONE = 30

export const blankLane = (id: string, at: number): Lane => ({
  id,
  label: id === MAIN ? 'Main session' : 'agent',
  type: id === MAIN ? 'main' : 'agent',
  status: id === MAIN ? 'idle' : 'running',
  startedAt: at,
  spans: [],
  ...(id === MAIN ? { turns: [] } : {}),
})

/** Drops the oldest spans of a long lane, and finished lanes beyond the newest few. */
export function prune(all: Record<string, Lane>) {
  const next: Record<string, Lane> = {}
  const done = Object.values(all)
    .filter(l => l.id !== MAIN && !LIVE.has(l.status))
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  const dropped = new Set(done.slice(KEEP_DONE).map(l => l.id))
  for (const lane of Object.values(all)) {
    if (dropped.has(lane.id)) continue
    next[lane.id] = lane.spans.length > KEEP_SPANS ? { ...lane, spans: lane.spans.slice(-KEEP_SPANS) } : lane
  }
  return next
}
