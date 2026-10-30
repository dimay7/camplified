import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'
import type { MockClock, TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'trace',
  component: 'Pane',
  requestId: 'trace',
  props: {
    title: 'Trace',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

type $ = Parameters<TestBody>[0]

/** Stands in for the engine: the agent list, tool results, turn ends. */
function world(on: On, agents: AgentInfo[], failing: string[] = []) {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'trace-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: agents }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // A call takes the time its input's `delayMs` says, on the mocked clock.
  on('tool.call', async (_, e) => {
    const { command, delayMs } = e as { command?: string; delayMs?: number }
    if (delayMs) await clock.sleep(delayMs)
    return failing.includes(String(command)) ? { result: {}, isError: true } : { result: {} }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return clock
}

async function start($: $, clock: MockClock) {
  await clock.set(1_700_000_000_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)
}

/** A tool call that takes `ms` on the mocked clock. */
async function call($: $, clock: MockClock, input: Record<string, unknown>, ms: number) {
  const ran = $.tool.call({ ...input, delayMs: ms } as never)
  await clock.advance(ms)
  await ran
}

const svgOf = async (ui: { find: (q: { type: 'Svg' }) => Promise<unknown> }) =>
  String(((await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined)?.props?.source ?? '')

const AGENTS: AgentInfo[] = [
  { id: 'a1', type: 'general-purpose', description: 'Review loader', status: 'running' },
  { id: 'a2', type: 'Explore', description: 'Find call sites', status: 'running', parentId: 'a1' },
]

test('an empty session says so', async ($, on) => {
  const clock = world(on, [])
  await start($, clock)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No tool calls yet/ }))).toBeTruthy()
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  await ui.unmount()
})

test('lanes, bars, the slowest calls and the summary', async ($, on) => {
  const clock = world(on, AGENTS)
  await start($, clock)
  await call($, clock, { tool: 'Read', file_path: '/src/elf.rs', agentId: 'a2' }, 300)
  await call($, clock, { tool: 'Bash', command: 'cargo test -p core', agentId: 'a1' }, 41_000)
  await call($, clock, { tool: 'Bash', command: 'npm test', agentId: 'a1' }, 9_600)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await svgOf(ui)
  expect(svg).toContain('Review loader')
  expect(svg).toContain('↳ Find call sites')
  expect(svg).toContain('bash')
  expect(svg).toContain('read / search')

  // Slowest first, with its length and lane.
  expect((await ui.find({ type: 'Text', text: /^cargo test -p core$/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /41\.0s · Review loader/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /in parallel now/ }))?.text).toBe('2 in parallel now')
  expect((await ui.find({ type: 'Text', text: /of tool time in/ }))?.text).toBe('99% of tool time in bash')
  expect((await ui.find({ type: 'Text', text: /errors?$/ }))?.text).toBe('0 errors')
  await ui.unmount()
})

test('a failed call is counted and drawn red', async ($, on) => {
  const clock = world(on, AGENTS, ['ls /missing'])
  await start($, clock)
  await call($, clock, { tool: 'Bash', command: 'ls /missing', agentId: 'a1' }, 200)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /errors?$/ }))?.text).toBe('1 error')
  expect(await svgOf(ui)).toContain('#f87171')
  await ui.unmount()
})

test('the window chips narrow what is counted', async ($, on) => {
  const clock = world(on, AGENTS)
  await start($, clock)
  await call($, clock, { tool: 'Bash', command: 'cargo build', agentId: 'a1' }, 5_000)
  await clock.advance(60_000)
  await call($, clock, { tool: 'Read', file_path: '/a.rs', agentId: 'a1' }, 400)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^cargo build$/ }))).toBeTruthy()
  await ui.press({ key: 'window-30s' })
  expect(await ui.find({ type: 'Text', text: /^cargo build$/ })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /of tool time in/ }))?.text).toBe('100% of tool time in read / search')
  await ui.press({ key: 'window-2m' })
  await ui.unmount()
})

test('a quiet agent is flagged on its lane', async ($, on) => {
  const clock = world(on, AGENTS)
  await start($, clock)
  await call($, clock, { tool: 'Read', file_path: '/a.rs', agentId: 'a1' }, 200)
  await clock.advance(70_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await svgOf(ui)).toContain('no tool call for 1:10')
  await ui.unmount()
})

test('the main session gets a lane while a turn runs', async ($, on) => {
  const clock = world(on, [])
  await start($, clock)
  await $.turn.start({ turnId: 't1' } as never)
  await call($, clock, { tool: 'Bash', command: 'ls' }, 100)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await svgOf(ui)).toContain('Main session')
  expect((await ui.find({ type: 'Text', text: /in parallel now/ }))?.text).toBe('1 in parallel now')
  await ui.unmount()
})

test('the terminal gets a line per lane instead of the chart', async ($, on) => {
  const clock = world(on, AGENTS)
  await start($, clock)
  await call($, clock, { tool: 'Read', file_path: '/a.rs', agentId: 'a1' }, 200)
  await call($, clock, { tool: 'Read', file_path: '/b.rs', agentId: 'a1' }, 200)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /^Review loader$/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^2 calls$/ }))).toBeTruthy()
  await ui.unmount()
})
