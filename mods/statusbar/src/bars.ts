import type { Span } from '../types'

/** A row as drawn: runs of text, and the progress bars a status line drew in characters. */
export type Segment = { kind: 'text'; spans: Span[] } | { kind: 'bar'; fill: number; color?: string; text: string }

// How full each block character is; any other bar character counts as empty.
const FULL: Record<string, number> = { '█': 1, '▉': 7 / 8, '▊': 6 / 8, '▋': 5 / 8, '▌': 4 / 8, '▍': 3 / 8, '▎': 2 / 8, '▏': 1 / 8, '▓': 1, '▒': 0.5 }
// Four cells or more of these, at least one of them full or empty, is a bar.
const RUN = /[█▉▊▋▌▍▎▏▓▒░·∙]{4,}/g

const fillOf = (run: string) => [...run].reduce((n, c) => n + (FULL[c] ?? 0), 0) / [...run].length

/**
 * Splits a row into text and bars. In the app's proportional face a bar of
 * block characters changes length as it fills (a `█` is wider than a `·`), so
 * each one is drawn as a real bar instead; text stays as it was printed.
 */
export function segments(row: Span[]): Segment[] {
  const out: Segment[] = []
  const pushText = (span: Span) => {
    if (!span.text) return
    const last = out[out.length - 1]
    if (last?.kind === 'text') last.spans.push(span)
    else out.push({ kind: 'text', spans: [span] })
  }
  for (const span of row) {
    let at = 0
    for (const m of span.text.matchAll(RUN)) {
      pushText({ ...span, text: span.text.slice(at, m.index) })
      out.push({ kind: 'bar', fill: fillOf(m[0]), color: span.color, text: m[0] })
      at = (m.index ?? 0) + m[0].length
    }
    pushText({ ...span, text: span.text.slice(at) })
  }
  return out
}

const BAR_W = 64
const BAR_H = 12
const TRACK_H = 4

/** A thin rounded bar, `fill` of it coloured, on a faint track of the same colour. */
export function barSvg(fill: number, color = '#8b949e') {
  const y = (BAR_H - TRACK_H) / 2
  const w = Math.max(0, Math.min(1, fill)) * BAR_W
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_W}" height="${BAR_H}" viewBox="0 0 ${BAR_W} ${BAR_H}">` +
    `<rect y="${y}" width="${BAR_W}" height="${TRACK_H}" rx="2" fill="${color}" fill-opacity=".22"/>` +
    (w > 0 ? `<rect y="${y}" width="${Math.max(w, TRACK_H).toFixed(1)}" height="${TRACK_H}" rx="2" fill="${color}"/>` : '') +
    `</svg>`
  )
}

export const BAR_SIZE = { width: BAR_W, height: BAR_H }

// A `|` or `│` standing alone between spaces is a separator a status line drew
// between its parts; in the app the parts are spaced apart instead.
const SEPARATOR = /(?:^|\s+)[|│](?:\s+|$)/

/**
 * Splits a row at its separators into groups of spans, the separators and the
 * spaces around them dropped, so each group can be drawn with room around it.
 * A row without separators is one group.
 */
export function groups(row: Span[]): Span[][] {
  const out: Span[][] = [[]]
  for (const span of row) {
    const parts = span.text.split(SEPARATOR)
    parts.forEach((text, i) => {
      if (i > 0) out.push([])
      if (text) out[out.length - 1]?.push({ ...span, text })
    })
  }
  return out
    .map(group => {
      // Trim the group's own edges: the space that stood beside a separator.
      const g = group.map(s => ({ ...s }))
      const first = g[0]
      const last = g[g.length - 1]
      if (first) first.text = first.text.trimStart()
      if (last) last.text = last.text.trimEnd()
      return g.filter(s => s.text)
    })
    .filter(g => g.length)
}
