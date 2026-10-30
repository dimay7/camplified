import type { Lane, Span } from '../types'
import { clip, clock, esc } from './format'
import {
  ERROR_COLOR,
  KIND_COLORS,
  KIND_LABELS,
  QUIET_COLOR,
  type Kind,
  kindOf,
  typeColor,
} from './kinds'
import { LIVE, MAIN } from './state'

// A running agent with no tool call for this long is worth a look.
export const QUIET_MS = 60_000
const MAX_LANES = 12

// Lane geometry, in CSS pixels: the chart is drawn at the pane's own width,
// so these are the sizes on screen.
const LABEL_W = 104
const TOP = 14
const ROW = 17
const BAR = 6

export type Row = { lane: Lane; depth: number }

const lastActivity = (lane: Lane) => Math.max(lane.startedAt, ...lane.spans.map(s => s.end ?? s.start))

/** The lanes worth drawing for this window: main first, then agents as a tree in start order. */
export function rowsFor(lanes: Lane[], from: number): Row[] {
  const inWindow = (l: Lane) => l.endedAt === undefined || l.endedAt >= from || lastActivity(l) >= from
  const agents = lanes.filter(l => l.id !== MAIN && inWindow(l)).sort((a, b) => a.startedAt - b.startedAt)
  const ids = new Set(agents.map(l => l.id))
  const rows: Row[] = []
  const main = lanes.find(l => l.id === MAIN)
  if (main) rows.push({ lane: main, depth: 0 })
  const walk = (lane: Lane, depth: number) => {
    rows.push({ lane, depth })
    for (const child of agents.filter(l => l.parentId === lane.id)) walk(child, depth + 1)
  }
  for (const root of agents.filter(l => !l.parentId || !ids.has(l.parentId))) walk(root, 0)
  // Live lanes first when there are too many to show.
  if (rows.length <= MAX_LANES) return rows
  const live = rows.filter(r => r.lane.id === MAIN || LIVE.has(r.lane.status))
  return [...live, ...rows.filter(r => !live.includes(r))].slice(0, MAX_LANES)
}

/** Where the window starts: `windowMs` back from now, or the session's first lane for "all". */
export function windowStart(lanes: Lane[], at: number, windowMs: number) {
  if (windowMs > 0) return at - windowMs
  const first = Math.min(at - 30_000, ...lanes.map(l => Math.min(l.startedAt, ...l.spans.map(s => s.start))))
  return first
}

const spanEnd = (s: Span, at: number) => s.end ?? at
const spanMs = (s: Span, at: number) => spanEnd(s, at) - s.start

export type Slow = { tool: string; detail: string; ms: number; lane: string; isRunning: boolean }

export type Summary = {
  /** Loops busy right now: live agents, and main while a turn runs. */
  parallel: number
  /** The kind that took most of the window's tool time, and its share. */
  topKind?: { kind: Kind; share: number }
  errors: number
  slowest: Slow[]
  kinds: Kind[]
}

export function summarize(rows: Row[], from: number, at: number): Summary {
  const byKind = new Map<Kind, number>()
  const slow: Slow[] = []
  let errors = 0
  let parallel = 0
  for (const { lane } of rows) {
    const busy =
      lane.id === MAIN
        ? (lane.turns ?? []).some(([, end]) => end === null) || lane.spans.some(s => s.end === undefined)
        : LIVE.has(lane.status)
    if (busy) parallel++
    for (const s of lane.spans) {
      if (spanEnd(s, at) < from) continue
      const ms = spanEnd(s, at) - Math.max(s.start, from)
      const kind = kindOf(s.tool)
      byKind.set(kind, (byKind.get(kind) ?? 0) + ms)
      if (s.isError) errors++
      slow.push({ tool: s.tool, detail: s.detail, ms: spanMs(s, at), lane: lane.label, isRunning: s.end === undefined })
    }
  }
  const total = [...byKind.values()].reduce((a, b) => a + b, 0)
  const top = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    parallel,
    topKind: top && total > 0 ? { kind: top[0], share: top[1] / total } : undefined,
    errors,
    slowest: slow.sort((a, b) => b.ms - a.ms).slice(0, 3),
    kinds: [...byKind.keys()],
  }
}

/** "-2m", "-90s": how far back a tick is. */
const back = (ms: number) => (ms >= 60_000 && ms % 60_000 === 0 ? `-${ms / 60_000}m` : `-${Math.round(ms / 1000)}s`)

// Round tick steps; the chart takes the smallest that leaves at most four ticks.
const STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map(s => s * 1000)
const tickStep = (span: number) => STEPS.find(step => span / step <= 4) ?? span / 4

// The chart sits on its own dark card, so its colours read the same in a
// light theme and a dark one.
const PAD_X = 8
const PAD_Y = 6
const CARD = '#141416'
// Narrower than this and the lane names crowd the bars out.
export const MIN_WIDTH = 280

/**
 * The timeline as one SVG, `width` CSS pixels wide: a lane per loop, each
 * tool call a bar as long as it took, coloured by kind, red when it failed; a
 * thin line where the loop was busy between calls; amber where a live agent
 * has gone quiet.
 */
export function chartSvg(rows: Row[], from: number, at: number, kinds: Kind[], hasErrors: boolean, width: number) {
  const W = Math.max(MIN_WIDTH, Math.round(width)) - PAD_X * 2
  const X0 = LABEL_W
  const X1 = W - 4
  const span = Math.max(1, at - from)
  const x = (t: number) => X0 + ((Math.min(Math.max(t, from), at) - from) / span) * (X1 - X0)
  const plotBottom = TOP + rows.length * ROW
  // The legend: the kinds on the chart, errors, and the busy line, wrapped
  // onto as many rows as the width needs.
  const items: { fill: string; label: string; isLine: boolean }[] = [
    ...kinds.map(k => ({ fill: KIND_COLORS[k], label: KIND_LABELS[k], isLine: false })),
    ...(hasErrors ? [{ fill: ERROR_COLOR, label: 'error', isLine: false }] : []),
    { fill: '#8b8a99', label: 'busy between calls', isLine: true },
  ]
  const itemW = (it: { label: string; isLine: boolean }) => (it.isLine ? 11 : 9) + it.label.length * 4.6 + 10
  const legendRows: (typeof items)[] = [[]]
  let used = 0
  for (const it of items) {
    if (used + itemW(it) > W && used > 0) {
      legendRows.push([])
      used = 0
    }
    legendRows[legendRows.length - 1]?.push(it)
    used += itemW(it)
  }
  const legendY = plotBottom + 8
  const H = legendY + (legendRows.length - 1) * 11 + 4
  const parts: string[] = []

  // Time axis: ticks at round steps back from now, and now itself.
  const step = tickStep(span)
  for (let ago = step; ago <= span; ago += step) {
    const tx = x(at - ago)
    // Too close to now's label to share the row.
    if (X1 - tx < 22) continue
    parts.push(`<line x1="${tx.toFixed(1)}" y1="${TOP - 3}" x2="${tx.toFixed(1)}" y2="${plotBottom}" stroke="#fff" stroke-opacity=".05"/>`)
    parts.push(`<text x="${tx.toFixed(1)}" y="8" class="axis" text-anchor="middle">${back(ago)}</text>`)
  }
  parts.push(`<text x="${X1}" y="8" class="axis" text-anchor="end">now</text>`)

  rows.forEach(({ lane, depth }, i) => {
    const mid = TOP + i * ROW + ROW / 2
    const color = typeColor(lane.id === MAIN ? 'main' : lane.type)
    const isLive = lane.id === MAIN || LIVE.has(lane.status)
    const name = `${depth ? '↳ ' : ''}${clip(lane.label, depth ? 15 : 17)}`
    parts.push(`<circle cx="${3 + depth * 7}" cy="${mid}" r="2.4" fill="${color}"/>`)
    parts.push(`<text x="${10 + depth * 7}" y="${mid + 3}" class="${isLive ? 'lane' : 'lane done'}">${esc(name)}</text>`)

    // Busy between calls: a main turn, or an agent's whole run.
    const busy: [number, number][] =
      lane.id === MAIN ? (lane.turns ?? []).map(([s, e]) => [s, e ?? at]) : [[lane.startedAt, lane.endedAt ?? at]]
    for (const [s, e] of busy) {
      if (e < from) continue
      parts.push(
        `<rect x="${x(s).toFixed(1)}" y="${mid - 1}" width="${Math.max(0, x(e) - x(s)).toFixed(1)}" height="2" rx="1" fill="${color}" fill-opacity=".22"/>`,
      )
    }

    for (const s of lane.spans) {
      if (spanEnd(s, at) < from) continue
      const sx = x(s.start)
      const w = Math.max(2, x(spanEnd(s, at)) - sx)
      const fill = s.isError ? ERROR_COLOR : KIND_COLORS[kindOf(s.tool)]
      const pulse =
        s.end === undefined
          ? `<animate attributeName="fill-opacity" values=".4;.95;.4" dur="1.4s" repeatCount="indefinite"/>`
          : ''
      parts.push(
        `<rect x="${sx.toFixed(1)}" y="${mid - BAR / 2}" width="${w.toFixed(1)}" height="${BAR}" rx="1.5" fill="${fill}">${pulse}</rect>`,
      )
    }

    // A live agent quiet for a while: tint the gap and say how long.
    const running = lane.spans.some(s => s.end === undefined)
    const last = lastActivity(lane)
    if (lane.id !== MAIN && lane.status === 'running' && !running && at - last >= QUIET_MS) {
      parts.push(
        `<rect x="${x(last).toFixed(1)}" y="${mid - 1}" width="${Math.max(0, X1 - x(last)).toFixed(1)}" height="2" rx="1" fill="${QUIET_COLOR}" fill-opacity=".45"/>`,
      )
      parts.push(
        `<text x="${(X1 - 2).toFixed(1)}" y="${mid - 3}" class="quiet" text-anchor="end">no tool call for ${clock(at - last)}</text>`,
      )
    }

    if (!isLive && lane.endedAt !== undefined && lane.endedAt >= from && x(lane.endedAt) < X1 - 30) {
      const word = lane.status === 'failed' ? 'failed' : lane.status === 'killed' ? 'stopped' : 'done'
      parts.push(`<text x="${(x(lane.endedAt) + 4).toFixed(1)}" y="${mid + 3}" class="axis">${word}</text>`)
    }
  })

  parts.push(
    `<line x1="${X1}" y1="${TOP - 3}" x2="${X1}" y2="${plotBottom}" stroke="#fff" stroke-opacity=".45" stroke-dasharray="2 2"/>`,
  )

  legendRows.forEach((row, r) => {
    const ly = legendY + r * 11
    let lx = 0
    for (const { fill, label, isLine } of row) {
      parts.push(
        isLine
          ? `<rect x="${lx}" y="${ly - 4}" width="8" height="2" rx="1" fill="${fill}" fill-opacity=".5"/>`
          : `<rect x="${lx}" y="${ly - 6}" width="6" height="6" rx="1.5" fill="${fill}"/>`,
      )
      parts.push(`<text x="${lx + (isLine ? 11 : 9)}" y="${ly}" class="legend">${label}</text>`)
      lx += itemW({ label, isLine })
    }
  })

  const w = W + PAD_X * 2
  const h = H + PAD_Y * 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<style>` +
    `.axis{font:8px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#6f6c85}` +
    `.lane{font:10px ui-sans-serif,system-ui,sans-serif;fill:#e8e6f0}` +
    `.lane.done{fill:#8d8aa3}` +
    `.legend{font:8.5px ui-sans-serif,system-ui,sans-serif;fill:#8d8aa3}` +
    `.quiet{font:8px ui-sans-serif,system-ui,sans-serif;fill:${QUIET_COLOR}}` +
    `</style>` +
    `<rect width="${w}" height="${h}" rx="8" fill="${CARD}"/>` +
    `<g transform="translate(${PAD_X} ${PAD_Y})">` +
    parts.join('') +
    `</g></svg>`
  )
}
