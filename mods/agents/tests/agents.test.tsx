import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

const PANE = {
  plugin: 'agents',
  component: 'Pane',
  requestId: 'agents',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const AGENTS: AgentInfo[] = [
  { id: 'a1', type: 'general-purpose', description: 'Review Task 13 (spec + quality)', status: 'running' },
  { id: 'a2', type: 'Explore', description: 'Find loader call sites', status: 'running' },
  { id: 'a3', type: 'Explore', description: 'Nested scan', status: 'running', parentId: 'a1' },
  { id: 'a4', type: 'Plan', description: 'Plan rebrand', status: 'completed' },
]

test('live agents become rows, on every surface', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: AGENTS }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)
  await $.tool.call({ tool: 'Bash', command: 'cargo test -p mida-core', agentId: 'a1' })
  await clock.advance(65_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /Review Task 13/ }))?.text).toBe('Review Task 13 (spec + quality)')
    expect((await ui.find({ type: 'Text', text: /Nested scan/ }))?.text).toBe('Nested scan')
    expect((await ui.find({ type: 'Text', text: /^Running · 3$/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /thinking · last Bash/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /^1:0[45]$/ }))).toBeTruthy()

    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Svg' })).toBeTruthy()
    } else {
      expect(await ui.find({ type: 'Svg' })).toBeFalsy()
    }
    await ui.unmount()
  }
})

test('the finished list opens on a press', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: AGENTS }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Plan rebrand/ })).toBeFalsy()
  await ui.press({ key: 'toggle-done' })
  expect((await ui.find({ type: 'Text', text: /Plan rebrand/ }))?.text).toBe('Plan rebrand')
  await ui.unmount()
})

test('a row expands to its prompt, calls and transcript button', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: AGENTS }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a2' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // The engine fills the spawn's other fields; the test gives what the mod reads.
  await $.agent.spawn({ prompt: 'Grep for every loader entry point.', description: 'Find loader call sites' } as never)
  await clock.advance(1000)
  // Grep is a tool some builds don't register; the mod takes any tool name.
  await $.tool.call({ tool: 'Grep', pattern: 'fn load_', agentId: 'a2' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Grep for every loader/ })).toBeFalsy()
  await ui.press({ key: 'card-a2' })
  expect((await ui.find({ type: 'Text', text: /Grep for every loader/ }))?.text).toBe('Grep for every loader entry point.')
  expect((await ui.find({ type: 'Text', text: /^Grep$/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^fn load_$/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /claude-haiku-5-5/ }))).toBeTruthy()
  expect(await ui.find({ key: 'view-a2' })).toBeTruthy()
  await ui.press({ key: 'fold-a2' })
  expect(await ui.find({ type: 'Text', text: /Grep for every loader/ })).toBeFalsy()
  await ui.unmount()
})

test('main reads thinking during a turn and idle after it', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  await clock.set(1_700_000_000_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ turnId: 't1' } as never)
  await clock.advance(3000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^thinking$/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^0:03$/ }))).toBeTruthy()
  await ui.unmount()

  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 3000, isAborted: false, reason: 'answer' } as never)
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /^idle$/ }))?.text).toBe('idle')
  await after.unmount()
})

test('a failed agent and an aborted one are marked in the finished list', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({
    value: [
      { id: 'f1', type: 'Explore', description: 'Broken search', status: 'failed' },
      { id: 'k1', type: 'Plan', description: 'Stopped plan', status: 'running' },
    ],
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))

  await clock.set(1_700_000_000_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)
  await $.turn.complete({ agentId: 'k1', turnId: 't', answer: '', durationMs: 1, isAborted: true, reason: 'aborted' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'toggle-done' })
  expect((await ui.find({ type: 'Text', text: /Broken search/ }))?.text).toBe('Broken search')
  expect((await ui.find({ key: 'toggle-done' }))?.text).toBe('Finished · 2 · 1 failed · 1 stopped  ⌄')
  await ui.unmount()
})

test('open transcript shows the agent conversation in the pane', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [{ id: 'a2', type: 'Explore', description: 'Find loader call sites', status: 'completed' }] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: [
      { role: 'user', content: [{ type: 'text', text: 'Find every loader.' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Searching now.' },
          { type: 'tool_use', id: 't1', name: 'Grep', input: { pattern: 'fn load_' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'src/elf.rs:12', is_error: false }] },
      { role: 'user', content: [{ type: 'text', text: '<system-reminder>hidden</system-reminder>' }] },
    ],
  }))

  await clock.set(1_700_000_000_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'toggle-done' })
    await ui.press({ key: 'row-a2' })
    await ui.press({ key: 'view-a2' })

    expect((await ui.find({ type: 'Text', text: /Find every loader/ }))?.text).toBe('Find every loader.')
    expect(await ui.find({ type: 'Markdown' })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /^fn load_$/ }))).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /src\/elf\.rs:12/ }))).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /hidden/ })).toBeFalsy()

    await ui.press({ key: 'transcript-back' })
    expect((await ui.find({ key: 'toggle-done' }))).toBeTruthy()
    // Leave the list as it was found: the row folded, the finished list shut.
    await ui.press({ key: 'row-a2' })
    await ui.press({ key: 'toggle-done' })
    await ui.unmount()
  }
})

test('an unreadable transcript says why', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [{ id: 'a9', type: 'Explore', description: 'Old agent', status: 'completed' }] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: { deny: 'a9 finished and no transcript was saved' } }))

  await clock.set(1_700_000_000_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'toggle-done' })
  await ui.press({ key: 'row-a9' })
  await ui.press({ key: 'view-a9' })
  expect((await ui.find({ type: 'Text', text: /no transcript was saved/ }))).toBeTruthy()
  await ui.unmount()
})

test('a running row shows live tokens, context and how long since its last call', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'agent-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [{ id: 'a1', type: 'Explore', description: 'Scan', status: 'running' }] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  const usage = { input_tokens: 1200, output_tokens: 850, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 0, model: 'm' }
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage } as never
  })

  await clock.set(1_700_000_000_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'a1' })
  const step = { turnId: 't', index: 0, model: 'm', messageCount: 2, agentId: 'a1' } as never
  // A step is a stream: reading it to its end runs the hooks on it.
  const drain = async (stream: AsyncGenerator<unknown, unknown>) => {
    let next = await stream.next()
    while (!next.done) next = await stream.next()
  }
  await drain($.turn.step(step))
  await drain($.turn.step(step))
  await clock.advance(70_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /context/ }))?.text).toBe('1 call · 1.7k out · 31.2k context')
    expect((await ui.find({ type: 'Text', text: /no tool call for/ }))?.text).toBe('no tool call for 1:10')
    await ui.unmount()
  }
})
