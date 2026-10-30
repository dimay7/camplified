import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { AgentRun, Transcript } from '../types'

export const PANE = 'agents'
export const TITLE = 'Agents'

// This file is the only one that touches the session's stored state: the
// engine lists what a module reads and writes from atoms declared with
// literal names in the file that uses them, so the rest of the mod goes
// through the accessors below (function declarations: past an import, the
// engine follows `$` only into those).

// Change a shape tag when its value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const runs = atom({ plugin: 'agents', key: 'runs' } as const, {}, { shape: 'runs-1' })
const main = atom({ plugin: 'agents', key: 'main' } as const, null)
const now = atom({ plugin: 'agents', key: 'now' } as const, 0)
// When the main loop's running turn started; 0 between turns.
const mainTurn = atom({ plugin: 'agents', key: 'mainTurn' } as const, 0)
// The prompt size of the main loop's latest model call.
const mainContext = atom({ plugin: 'agents', key: 'mainContext' } as const, 0)
const showDone = atom({ plugin: 'agents', key: 'showDone' } as const, false)
const expanded = atom({ plugin: 'agents', key: 'expanded' } as const, [])
// The agent whose conversation the pane shows in place of the list, if any.
const transcript = atom({ plugin: 'agents', key: 'transcript' } as const, null)

type Call = { tool: string; detail: string; ref: string }
type $ = EngineInterface

export function readRuns($: $) {
  return read($, runs)
}
export function updateRuns($: $, fn: (all: Record<string, AgentRun>) => Record<string, AgentRun>) {
  return update($, runs, fn)
}
export function readMain($: $) {
  return read($, main)
}
export function updateMain($: $, fn: (call: Call | null) => Call | null) {
  return update($, main, fn)
}
export function readNow($: $) {
  return read($, now)
}
export function setNow($: $, at: number) {
  return update($, now, () => at)
}
export function readMainTurn($: $) {
  return read($, mainTurn)
}
export function setMainTurn($: $, at: number) {
  return update($, mainTurn, () => at)
}
export function readMainContext($: $) {
  return read($, mainContext)
}
export function setMainContext($: $, size: number) {
  return update($, mainContext, () => size)
}
export function readShowDone($: $) {
  return read($, showDone)
}
export function toggleShowDone($: $) {
  return update($, showDone, open => !open)
}
export function readExpanded($: $) {
  return read($, expanded)
}
/** Opens or folds one row; at most the last eight stay open. */
export function toggleExpanded($: $, id: string) {
  return update($, expanded, list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id].slice(-8)))
}
export function readTranscript($: $) {
  return read($, transcript)
}
export function updateTranscript($: $, fn: (shown: Transcript | null) => Transcript | null) {
  return update($, transcript, fn)
}

export const LIVE = new Set(['pending', 'running', 'waiting', 'idle'])
export const KEEP_DONE = 60
export const KEEP_CALLS = 40
export const SPARK_BUCKET_MS = 10_000
export const SPARK_BUCKETS = 12

export const blank = (id: string, at: number): AgentRun => ({
  id,
  type: 'agent',
  description: '',
  status: 'running',
  startedAt: at,
  tools: 0,
  ticks: [],
  tokens: 0,
  calls: [],
})

// Finished agents beyond the newest few are dropped; live ones always stay.
export function prune(all: Record<string, AgentRun>) {
  const done = Object.values(all)
    .filter(r => !LIVE.has(r.status))
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  if (done.length <= KEEP_DONE) return all
  const next = { ...all }
  for (const r of done.slice(KEEP_DONE)) delete next[r.id]
  return next
}

/** Live agents as a tree: roots in start order, each followed by its children. */
export function liveTree(all: AgentRun[]) {
  const live = all.filter(r => LIVE.has(r.status)).sort((a, b) => a.startedAt - b.startedAt)
  const ids = new Set(live.map(r => r.id))
  const out: { run: AgentRun; depth: number }[] = []
  const walk = (run: AgentRun, depth: number) => {
    out.push({ run, depth })
    for (const child of live.filter(r => r.parentId === run.id)) walk(child, depth + 1)
  }
  for (const root of live.filter(r => !r.parentId || !ids.has(r.parentId))) walk(root, 0)
  return out
}

/** Tool calls per slot over the chart's window, now in the last slot. */
export function buckets(ticks: number[], at: number) {
  const counts = Array.from({ length: SPARK_BUCKETS }, () => 0)
  for (const t of ticks) {
    const back = Math.floor((at - t) / SPARK_BUCKET_MS)
    const slot = SPARK_BUCKETS - 1 - back
    if (back >= 0 && back < SPARK_BUCKETS) counts[slot] = (counts[slot] ?? 0) + 1
  }
  return counts
}
