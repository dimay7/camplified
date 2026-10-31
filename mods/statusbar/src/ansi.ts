import type { Span } from '../types'

// The 16 terminal colours, mid-tones that read on a light and a dark page.
// White and black stay the page's own text colour, as a terminal theme draws them.
const BASIC = ['', '#e5534b', '#3fb950', '#d29922', '#4c8dff', '#c06ae0', '#2fb5c8', '']
const BRIGHT = ['#8b949e', '#ff7b72', '#56d364', '#e3b341', '#79c0ff', '#d2a8ff', '#56d4dd', '']

type Style = Omit<Span, 'text'>

const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')

/** One of the 256 xterm colours: the 16 above, a 6×6×6 cube, then 24 greys. */
function xterm(n: number) {
  if (n < 8) return BASIC[n] || undefined
  if (n < 16) return BRIGHT[n - 8] || undefined
  if (n < 232) {
    const c = n - 16
    const level = (v: number) => (v ? 55 + v * 40 : 0)
    return `#${hex(level(Math.floor(c / 36)))}${hex(level(Math.floor(c / 6) % 6))}${hex(level(c % 6))}`
  }
  const g = 8 + (n - 232) * 10
  return `#${hex(g)}${hex(g)}${hex(g)}`
}

/** Applies one SGR sequence's parameters (`1;36`, `38;5;208`) to a style. */
function apply(style: Style, params: number[]): Style {
  let next: Style = { ...style }
  for (let i = 0; i < params.length; i++) {
    const p = params[i] ?? 0
    if (p === 38 || p === 48) {
      // An extended colour: `5;n` from the 256, or `2;r;g;b`. Backgrounds are
      // read past, not drawn: the page's own colour reads better behind text.
      const isTrue = params[i + 1] === 2
      const color = isTrue
        ? `#${hex(params[i + 2] ?? 0)}${hex(params[i + 3] ?? 0)}${hex(params[i + 4] ?? 0)}`
        : xterm(params[i + 2] ?? 0)
      if (p === 38) next.color = color
      i += isTrue ? 4 : 2
    } else if (p === 0) next = {}
    else if (p === 1) next.isBold = true
    else if (p === 2) next.isDim = true
    else if (p === 3) next.isItalic = true
    else if (p === 4) next.isUnderline = true
    else if (p === 22) next = { ...next, isBold: undefined, isDim: undefined }
    else if (p === 23) next.isItalic = undefined
    else if (p === 24) next.isUnderline = undefined
    else if (p >= 30 && p <= 37) next.color = BASIC[p - 30] || undefined
    else if (p >= 90 && p <= 97) next.color = BRIGHT[p - 90] || undefined
    else if (p === 39) next.color = undefined
  }
  // Only the styles in force, so spans compare and serialize cleanly.
  return Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined))
}

const sameStyle = (a: Style, b: Style) =>
  a.color === b.color &&
  a.isBold === b.isBold &&
  a.isDim === b.isDim &&
  a.isItalic === b.isItalic &&
  a.isUnderline === b.isUnderline

const SEQUENCE = /\x1b\[([0-9;]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

/**
 * Turns what a status line command printed into rows of styled spans: one row
 * per line, the colours and weights its SGR codes set, any other escape (a
 * cursor move, an OSC 8 link's wrapper) dropped with its text kept.
 */
export function parseAnsi(output: string): Span[][] {
  let style: Style = {}
  return output
    .replace(/\r/g, '')
    .replace(/\n+$/, '')
    .split('\n')
    .map(raw => {
      const row: Span[] = []
      let at = 0
      const push = (text: string) => {
        if (!text) return
        const last = row[row.length - 1]
        if (last && sameStyle(last, style)) last.text += text
        else row.push({ text, ...style })
      }
      for (const m of raw.matchAll(SEQUENCE)) {
        push(raw.slice(at, m.index))
        at = (m.index ?? 0) + m[0].length
        if (m[2] === 'm') style = apply(style, (m[1] || '0').split(';').map(n => parseInt(n, 10) || 0))
      }
      push(raw.slice(at))
      return row
    })
    .filter(row => row.some(s => s.text.trim()))
}
