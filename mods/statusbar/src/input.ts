import type { SessionUsage } from 'claude-code'

import type { Span } from '../types'

/** What the session is, read once per status line run. */
export type Facts = {
  sessionId: string
  cwd: string
  projectDir: string
  model: string
  version: string
  usage: SessionUsage
  lines: { added: number; removed: number }
  at: number
}

/** `claude-opus-5-5[1m]` reads `Opus 5.5 (1M context)`; a name already shown as words stays. */
export function displayName(model: string) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?(\[1m\])?$/i.exec(model)
  const [, name = '', major, minor, long] = m ?? []
  if (!m) return model
  const family = name.charAt(0).toUpperCase() + name.slice(1)
  return `${family} ${major}${minor ? `.${minor}` : ''}${long ? ' (1M context)' : ''}`
}

const seconds = (iso?: string) => (iso ? Math.floor(Date.parse(iso) / 1000) : undefined)

/**
 * The JSON a statusLine command reads on stdin, as the CLI writes it: the
 * fields a script reaches for (`model.display_name`, `workspace.current_dir`,
 * `context_window.used_percentage`, `cost.*`, `rate_limits.*`).
 */
export function statusInput(f: Facts) {
  const { context, cost, rateLimits } = f.usage
  const limit = (kind: string) => {
    const r = rateLimits.find(l => l.kind === kind)
    return r ? { used_percentage: r.percentUsed, resets_at: seconds(r.resetsAt) } : undefined
  }
  return {
    hook_event_name: 'Status',
    session_id: f.sessionId,
    cwd: f.cwd,
    model: { id: f.model, display_name: displayName(f.model) },
    workspace: { current_dir: f.cwd, project_dir: f.projectDir },
    version: f.version,
    cost: {
      total_cost_usd: cost?.usd ?? 0,
      total_duration_ms: Math.max(0, f.at - f.usage.startedAt),
      total_lines_added: f.lines.added,
      total_lines_removed: f.lines.removed,
    },
    context_window: {
      context_window_size: context.window,
      total_input_tokens: context.tokens ?? 0,
      used_percentage: context.percent ?? null,
      remaining_percentage: context.percent === undefined ? null : 100 - context.percent,
    },
    exceeds_200k_tokens: (context.tokens ?? 0) > 200_000,
    rate_limits: { five_hour: limit('five_hour'), seven_day: limit('seven_day') },
  }
}

export function duration(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
}

// The same marks a typical status line draws, in the parser's palette.
const CYAN = '#2fb5c8'
const YELLOW = '#d29922'
const MAGENTA = '#c06ae0'
const GREEN = '#3fb950'
const RED = '#e5534b'
const BLUE = '#4c8dff'

const levelColor = (pct: number) => (pct >= 80 ? MAGENTA : pct >= 50 ? YELLOW : CYAN)

/**
 * The line drawn when no statusLine command is set, or it failed: model and
 * folder, then the context bar, rate limits, lines changed, cost and time.
 */
export function builtinRows(f: Facts): Span[][] {
  const { context, cost, rateLimits } = f.usage
  const sep: Span = { text: ' | ', isDim: true }
  const dir = f.cwd.split('/').filter(Boolean).pop() ?? f.cwd
  const top: Span[] = [
    { text: `[${displayName(f.model)}]`, color: CYAN, isBold: true },
    { text: ` 📁 ${dir}`, color: YELLOW },
  ]

  const pct = Math.round(context.percent ?? 0)
  const filled = Math.round((Math.min(pct, 100) * 20) / 100)
  const bottom: Span[] = [
    { text: '█'.repeat(filled) + '·'.repeat(20 - filled), color: levelColor(pct) },
    { text: ` ${pct}%` },
  ]
  for (const r of rateLimits.filter(l => l.kind === 'five_hour' || l.kind === 'seven_day')) {
    const used = Math.round(r.percentUsed)
    bottom.push(sep, { text: r.kind === 'five_hour' ? '⏳5h ' : '📅7d ' }, { text: `${used}%`, color: levelColor(used) })
  }
  bottom.push(
    sep,
    { text: `+${f.lines.added}`, color: GREEN },
    { text: '/' },
    { text: `-${f.lines.removed}`, color: RED },
    sep,
    { text: `$${(cost?.usd ?? 0).toFixed(2)}`, color: GREEN },
    sep,
    { text: `⏱ ${duration(f.at - f.usage.startedAt)}`, color: BLUE },
  )
  return [top, bottom]
}
