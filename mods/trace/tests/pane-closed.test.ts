import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// The mod's own note that the person closed its pane. The test kit can't raise
// a person's close (ui.close with origin "person"), so these seed the note it
// leaves and check what the mod does with it.
const CLOSED = 'pane.closed'

/** Stands in for the engine, counting the times the mod opens its pane. */
function world(on: On, stored: Record<string, unknown> = {}) {
  mock.clock(on)
  mock.store(on, stored)
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'trace-pane' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return opened
}

const start = { cwd: '/', surface: 'desktop', isInteractive: true } as const

test('the pane opens when a session starts', async ($, on) => {
  const opened = world(on)
  await $.session.start(start)
  expect(opened).toEqual(['trace'])
})

test('closed by the person last time, it stays closed', async ($, on) => {
  const opened = world(on, { [CLOSED]: true })
  await $.session.start(start)
  expect(opened).toEqual([])
})

test('/trace-pane reopens it, and it opens at start again after that', async ($, on) => {
  const opened = world(on, { [CLOSED]: true })
  await $.session.start(start)
  await $.command.run({ command: 'trace-pane', args: '' } as never)
  expect(opened).toEqual(['trace'])
  await $.session.start(start)
  expect(opened).toEqual(['trace', 'trace'])
})
