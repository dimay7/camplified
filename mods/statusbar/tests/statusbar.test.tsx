import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface, SessionUsage } from 'claude-code'

import { parseAnsi } from '../src/ansi'
import { groups, segments } from '../src/bars'
import { displayName } from '../src/input'

const BAND = {
  plugin: 'statusbar',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type Node = { type: string; props?: Record<string, unknown>; children?: (Node | string)[] }

/** The drawn runs of text, each with its own style: the Texts that hold only strings. */
function textRuns(node: Node | undefined): { text: string; props: Record<string, unknown> }[] {
  if (!node) return []
  const kids = node.children ?? []
  if (node.type === 'Text' && kids.every(k => typeof k === 'string')) return [{ text: kids.join(''), props: node.props ?? {} }]
  return kids.flatMap(k => (typeof k === 'string' ? [] : textRuns(k)))
}

const START = 1_700_000_000_000
const USAGE: SessionUsage = {
  startedAt: START,
  context: { tokens: 20_000, window: 200_000, percent: 10 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2023-11-14T23:13:20.000Z' }],
  cost: { usd: 1.68 },
} as SessionUsage

// What a two-line script prints: bold cyan model, yellow folder; a green cost.
const SCRIPT_OUT = '\x1b[1m\x1b[36m[Opus 5.5]\x1b[0m \x1b[33m📁 dream\x1b[0m\n\x1b[32m$1.68\x1b[0m \x1b[2m|\x1b[0m ⏱ 3s\n'

/** Stands in for the engine: the session's figures, the settings and the host's shell. */
function world(
  on: On,
  opts: {
    statusLine?: { type: string; command: string }
    run?: { exitCode: number; stdout: string; stderr: string } | 'throw'
    surfaces?: RenderSurface[]
  } = {},
) {
  const clock = mock.clock(on)
  mock.store(on, {})
  mock.env(on, { PATH: '/usr/bin:/bin' })
  const runs: { argv: readonly string[]; stdin?: string; path?: string }[] = []
  on('command.register', () => ({ value: { command: 'statusbar' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['desktop'] }))
  on('session.id', () => ({ value: 'abc' }))
  on('session.cwd', () => ({ value: '/Users/me/dream' }))
  on('session.root', () => ({ value: '/Users/me/dream' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.version', () => ({ value: { version: '2.1.309' } }))
  on('session.usage', () => ({ value: USAGE }))
  on('settings.read', () => ({ value: opts.statusLine ? { statusLine: opts.statusLine } : {} }))
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin, path: e.init?.env?.PATH })
    if (opts.run === 'throw') throw new Error('timed out after 5000 ms')
    const ran = opts.run ?? { exitCode: 0, stdout: SCRIPT_OUT, stderr: '' }
    return { value: { ...ran, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', () => ({ value: JSON.stringify({ name: 'statusbar', version: '0.1.0' }) }))
  on('http.fetch', () => ({ value: { status: 404, ok: false, headers: {}, text: '' } }))
  // The engine's own band is empty: what the mod hands on draws nothing.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  return { clock, runs }
}

const COMMAND = { type: 'command', command: 'bash ~/.claude/statusline-command.sh' }

test("the person's status line is run on the session's figures and drawn in colour", async ($, on) => {
  const { clock, runs } = world(on, { statusLine: COMMAND })
  await clock.set(START + 3000)
  await $.session.start({ cwd: '/Users/me/dream', surface: 'desktop', isInteractive: true })
  await clock.advance(600)

  expect(runs.length).toBe(1)
  expect(runs[0]?.argv).toEqual(['/bin/sh', '-c', COMMAND.command])
  expect(runs[0]?.path).toBe('/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin')
  const input = JSON.parse(runs[0]?.stdin ?? '{}')
  expect(input.model).toEqual({ id: 'claude-opus-5-5', display_name: 'Opus 5.5' })
  expect(input.workspace.current_dir).toBe('/Users/me/dream')
  expect(input.context_window.used_percentage).toBe(10)
  expect(input.cost.total_cost_usd).toBe(1.68)
  expect(input.cost.total_duration_ms).toBe(3500)
  expect(input.rate_limits.five_hour).toEqual({ used_percentage: 42, resets_at: 1_700_003_600 })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = textRuns((await ui.find({ type: 'Box' })) as Node)
  expect(drawn.find(r => r.text === '[Opus 5.5]')?.props).toMatchObject({ color: '#2fb5c8', weight: 'semibold' })
  expect(drawn.find(r => r.text === '$1.68')?.props.color).toBe('#3fb950')
  // The separator is dropped: the groups either side of it are spaced apart instead.
  expect(drawn.map(r => r.text)).toEqual(['[Opus 5.5]', ' ', '📁 dream', '$1.68', '⏱ 3s'])
  expect(drawn.every(r => r.props.mono === undefined)).toBe(true)
  await ui.unmount()
})

test('the terminal keeps its own status line: the band draws nothing there', async ($, on) => {
  const { clock } = world(on, { statusLine: COMMAND })
  await clock.set(START)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(600)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '[Opus 5.5]' })).toBeFalsy()
  await ui.unmount()
})

test('a terminal-only session runs no command', async ($, on) => {
  const { clock, runs } = world(on, { statusLine: COMMAND, surfaces: ['terminal'] })
  await clock.set(START)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(6000)
  expect(runs.length).toBe(0)
})

test('with no status line set, the built-in line shows the same figures', async ($, on) => {
  const { clock, runs } = world(on)
  on('tool.call', () => ({
    result: { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c', ' d'] }] },
  }))
  await clock.set(START)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b\nc' })
  await clock.advance(65_000)

  expect(runs.length).toBe(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '[Opus 5.5]' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^10%$/ })).toBeTruthy()
  // The context bar is a drawn bar, not block characters in a proportional face.
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('10%')
  expect(await ui.find({ type: 'Text', text: /█/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: '+2' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '-1' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '$1.68' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^⏱ 1m/ })).toBeTruthy()
  await ui.unmount()
})

test('a failing command falls back to the built-in line and says why', async ($, on) => {
  const { clock } = world(on, { statusLine: COMMAND, run: { exitCode: 127, stdout: '', stderr: 'jq: command not found\n' } })
  await clock.set(START)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(600)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '[Opus 5.5]' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /failed \(jq: command not found\)/ })).toBeTruthy()
  await ui.unmount()
})

test('/statusbar hides the line, and shows it again', async ($, on) => {
  const { clock } = world(on, { statusLine: COMMAND })
  await clock.set(START)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(600)

  expect((await $.command.run({ command: 'statusbar', args: '' } as never)).text).toMatch(/hidden/)
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '[Opus 5.5]' })).toBeFalsy()
  await ui.unmount()

  expect((await $.command.run({ command: 'statusbar', args: '' } as never)).text).toMatch(/shown/)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '[Opus 5.5]' })).toBeTruthy()
  await ui.unmount()
})

test('ANSI codes become styled spans', () => {
  const rows = parseAnsi('\x1b[38;5;208morange\x1b[39m plain \x1b[38;2;1;2;3mrgb\x1b[0m\n\n\x1b]8;;https://x\x07link\x1b]8;;\x07\n')
  expect(rows).toEqual([
    [{ text: 'orange', color: '#ff8700' }, { text: ' plain ' }, { text: 'rgb', color: '#010203' }],
    [{ text: 'link' }],
  ])
})

test('a run of block characters is a bar; other text stays', () => {
  const segs = segments([{ text: '██▌·····', color: '#2fb5c8' }, { text: ' 31% · ok' }])
  expect(segs).toEqual([
    { kind: 'bar', fill: 2.5 / 8, color: '#2fb5c8', text: '██▌·····' },
    { kind: 'text', spans: [{ text: ' 31% · ok' }] },
  ])
})

test('separators split a row into groups; other bars and slashes stay', () => {
  const row = [{ text: '[Opus] ', color: 'c' }, { text: '|', isDim: true }, { text: ' 22% | +54/-0 a|b' }]
  expect(groups(row)).toEqual([[{ text: '[Opus]', color: 'c' }], [{ text: '22%' }], [{ text: '+54/-0 a|b' }]])
  expect(groups([{ text: 'no separators here' }])).toEqual([[{ text: 'no separators here' }]])
})

test('model ids read as their names', () => {
  expect(displayName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(displayName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 (1M context)')
  expect(displayName('Opus 5.5')).toBe('Opus 5.5')
})
