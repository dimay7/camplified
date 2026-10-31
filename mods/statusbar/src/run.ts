import type { EngineInterface, On } from 'claude-code'

import type { Line } from '../types'
import { parseAnsi } from './ansi'
import type { Facts } from './input'
import { builtinRows, statusInput } from './input'
import { addLines, readHidden, readLines, setLine } from './state'

// The CLI reruns its status line as the conversation moves; between moves the
// clock and git still change, so the line is also refreshed this often.
const IDLE_MS = 5000
// A status line that takes longer than this is cut off, as the CLI does.
const TIMEOUT_MS = 5000

// Set by the hooks below when something the line shows has moved; read by the
// tick, which runs the command at most once at a time.
let isStale = true
let isRunning = false
let lastRun = 0

type StatusLine = { type?: string; command?: string }

// An app opened from the Dock may start without the shell profile's PATH, so
// tools a status line script calls (jq, git from Homebrew) are added back.
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin']

async function searchPath($: EngineInterface) {
  const path = (await $.env.get('PATH')) ?? '/usr/bin:/bin'
  const have = path.split(':')
  return [path, ...EXTRA_PATH.filter(p => !have.includes(p))].join(':')
}

/** The first line of what went wrong, short enough for one dim row. */
const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, 160) ?? ''

async function facts($: EngineInterface, at: number): Promise<Facts> {
  const [sessionId, cwd, projectDir, model, version, usage, lines] = await Promise.all([
    $.session.id(),
    $.session.cwd(),
    $.session.root(),
    $.session.model(),
    $.session.version(),
    $.session.usage(),
    readLines($),
  ])
  return { sessionId, cwd, projectDir, model, version: version.version, usage, lines, at }
}

/** Runs the person's statusLine command on the session's figures, or draws the built-in line. */
async function refresh($: EngineInterface, at: number) {
  const f = await facts($, at)
  const setting = (await $.settings.read({ key: 'statusLine' })) as StatusLine | undefined
  const command = setting?.type === 'command' ? setting.command?.trim() : undefined
  if (!command) return setLine($, { rows: builtinRows(f), source: 'builtin' })

  let line: Line
  try {
    const ran = await $.process.run(['/bin/sh', '-c', command], {
      cwd: f.cwd,
      env: { PATH: await searchPath($) },
      stdin: JSON.stringify(statusInput(f)),
      timeoutMs: TIMEOUT_MS,
    })
    const rows = parseAnsi(ran.stdout)
    line =
      ran.exitCode === 0 && rows.length
        ? { rows, source: 'command' }
        : {
            rows: builtinRows(f),
            source: 'builtin',
            error: firstLine(ran.stderr) || (ran.exitCode ? `exited with ${ran.exitCode}` : 'printed nothing'),
          }
  } catch (err) {
    line = { rows: builtinRows(f), source: 'builtin', error: firstLine(String((err as Error)?.message ?? err)) }
  }
  return setLine($, line)
}

/**
 * Starts the tick that keeps the line current: on a change the hooks below
 * mark, or every few seconds. It runs nothing where only a terminal draws
 * the session, since the terminal shows the CLI's own status line.
 */
export function startStatus($: EngineInterface) {
  const tick = async () => {
    if (isRunning) return
    const at = await $.clock.now()
    if (!isStale && at - lastRun < IDLE_MS) return
    if (await readHidden($)) return
    const surfaces = await $.session.surfaces()
    if (!surfaces.some(s => s !== 'terminal')) return

    isRunning = true
    isStale = false
    lastRun = at
    try {
      await refresh($, at)
    } finally {
      isRunning = false
    }
  }
  isStale = true
  $.clock.every(500, () => void tick().catch(() => undefined))
}

/** A unified diff's added and removed lines, its headers aside. */
function countPatch(hunks: { lines?: string[] }[]) {
  let added = 0
  let removed = 0
  for (const h of hunks)
    for (const l of h.lines ?? []) {
      if (l.startsWith('+')) added++
      else if (l.startsWith('-')) removed++
    }
  return { added, removed }
}

/** Marks the line stale as the session moves, and counts the lines edits change. */
export function track(on: On) {
  on('session.measure', ($, e, next) => {
    isStale = true
    return next(e)
  })
  on('turn.start', ($, e, next) => {
    isStale = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    isStale = true
    return done
  })

  // Observe only: the call runs as it would without this mod.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      const result = (ran as { result?: unknown }).result as
        | { structuredPatch?: { lines?: string[] }[]; type?: string; content?: string }
        | undefined
      if (!ran.deny && !ran.isError && result) {
        let n = { added: 0, removed: 0 }
        if (Array.isArray(result.structuredPatch) && result.structuredPatch.length)
          n = countPatch(result.structuredPatch)
        else if (result.type === 'create' && typeof result.content === 'string')
          n = { added: result.content.replace(/\n$/, '').split('\n').length, removed: 0 }
        if (n.added || n.removed) await addLines($, n.added, n.removed)
      }
    } catch {}
    isStale = true
    return ran
  })
}
