import { AMBER, MUTED, RED } from './theme'

// Small vector marks. Each one's markup depends on its colour and state alone,
// so a redraw for the clock leaves the drawn image (and its animation) alone.

const SVG = (size: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 12 12">${body}</svg>`

const ICONS = {
  running: (c: string) =>
    SVG(
      12,
      `<circle cx="6" cy="6" r="4.6" fill="none" stroke="${c}" stroke-opacity=".22" stroke-width="1.5"/>` +
        `<path d="M6 1.4A4.6 4.6 0 0 1 10.6 6" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round">` +
        `<animateTransform attributeName="transform" type="rotate" from="0 6 6" to="360 6 6" dur=".9s" repeatCount="indefinite"/></path>`,
    ),
  waiting: () =>
    SVG(
      12,
      `<circle cx="6" cy="6" r="2.4" fill="${AMBER}"/>` +
        `<circle cx="6" cy="6" r="2.4" fill="none" stroke="${AMBER}" stroke-width="1">` +
        `<animate attributeName="r" values="2.4;5.4" dur="1.6s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values=".8;0" dur="1.6s" repeatCount="indefinite"/></circle>`,
    ),
  completed: (c: string) =>
    SVG(
      12,
      `<circle cx="6" cy="6" r="4.6" fill="none" stroke="${c}" stroke-opacity=".55" stroke-width="1.3"/>` +
        `<path d="M3.9 6.1l1.4 1.4 2.8-2.9" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
  failed: () =>
    SVG(
      12,
      `<circle cx="6" cy="6" r="4.6" fill="none" stroke="${RED}" stroke-width="1.3"/>` +
        `<path d="M4.4 4.4l3.2 3.2M7.6 4.4l-3.2 3.2" stroke="${RED}" stroke-width="1.3" stroke-linecap="round"/>`,
    ),
  killed: () =>
    SVG(
      12,
      `<circle cx="6" cy="6" r="4.6" fill="none" stroke="${MUTED}" stroke-width="1.3"/>` +
        `<rect x="4.3" y="4.3" width="3.4" height="3.4" rx=".6" fill="${MUTED}"/>`,
    ),
  idle: () => SVG(12, `<circle cx="6" cy="6" r="2.2" fill="${MUTED}" fill-opacity=".6"/>`),
}

// What the terminal draws in their place.
const GLYPHS = {
  running: '◌',
  waiting: '◉',
  completed: '✓',
  failed: '✕',
  killed: '■',
  idle: '·',
}

export function iconFor(status: string, color: string) {
  // The main session between turns; `idle` itself is a teammate waiting for mail.
  if (status === 'quiet') return { svg: ICONS.idle(), glyph: GLYPHS.idle }
  if (status === 'running' || status === 'pending') return { svg: ICONS.running(color), glyph: GLYPHS.running }
  if (status === 'waiting' || status === 'idle') return { svg: ICONS.waiting(), glyph: GLYPHS.waiting }
  if (status === 'failed') return { svg: ICONS.failed(), glyph: GLYPHS.failed }
  if (status === 'killed') return { svg: ICONS.killed(), glyph: GLYPHS.killed }
  return { svg: ICONS.completed(color), glyph: GLYPHS.completed }
}

/**
 * Tool calls per 10-second slot over the last two minutes, now at the right
 * edge; slots from before the agent started are left undrawn.
 */
export function sparkSvg(counts: number[], color: string, firstSlot: number, tip: string) {
  const w = 48
  const h = 14
  const top = Math.max(2, ...counts)
  const step = w / (counts.length - 1)
  const from = Math.min(firstSlot, counts.length - 2)
  const pts = counts.map((c, i) => [i * step, h - 1.5 - (c / top) * (h - 3)] as const).slice(from)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const x0 = (from * step).toFixed(1)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${tip}</title>` +
    `<rect width="${w}" height="${h}" fill="transparent"/>` +
    (from > 0 ? `<path d="M0 ${h - 1.5} L${x0} ${h - 1.5}" stroke="${color}" stroke-opacity=".18" stroke-dasharray="1 2"/>` : '') +
    `<path d="${line} L${w} ${h} L${x0} ${h}Z" fill="${color}" fill-opacity=".12"/>` +
    `<path d="${line}" fill="none" stroke="${color}" stroke-opacity=".85" stroke-width="1.2" stroke-linejoin="round"/></svg>`
  )
}

const BARS = '▁▂▃▄▅▆▇█'

/** The same chart as block characters, for the terminal. */
export const sparkText = (counts: number[]) => {
  const top = Math.max(2, ...counts)
  return counts.map(c => BARS[Math.min(7, Math.round((c / top) * 7))]).join('')
}
