import { expect, mock, test } from 'claude-code/testing'
import type { MockClock, TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

const MARKET = (names: string[]) =>
  JSON.stringify({ name: 'camplified', plugins: names.map(name => ({ name, source: `./mods/${name}` })) })
const MANIFEST = (version: string) => JSON.stringify({ name: 'trace', version })

/** Stands in for the engine and GitHub: what the mod fetches, reads and toasts. */
function world(
  on: On,
  remote: { market?: string; manifest?: string; offline?: boolean },
  stored: Record<string, unknown> = {},
) {
  const clock = mock.clock(on)
  mock.store(on, stored)
  const toasts: string[] = []
  const fetched: string[] = []
  on('command.register', () => ({ value: { command: 'trace-pane' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: MANIFEST('0.1.0') }))
  on('http.fetch', (_, e) => {
    fetched.push(e.url)
    if (remote.offline) throw new Error('offline')
    const text = e.url.endsWith('/.claude-plugin/marketplace.json') && !e.url.includes('/mods/') ? remote.market : remote.manifest
    return { value: text ? { status: 200, ok: true, headers: {}, text } : { status: 404, ok: false, headers: {}, text: '' } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { clock, toasts, fetched }
}

async function startSession($: Parameters<TestBody>[0], clock: MockClock) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(6000)
}

test('a newer version on GitHub is announced with the update command', async ($, on) => {
  const { clock, toasts } = world(on, { market: MARKET(['trace']), manifest: MANIFEST('0.2.0') })
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  expect(toasts).toEqual([
    'camplified: trace 0.2.0 is out (you have 0.1.0). Run: claude plugin update trace@camplified, then /reload-plugins',
  ])
})

test('the same version says nothing', async ($, on) => {
  const { clock, toasts, fetched } = world(on, { market: MARKET(['trace']), manifest: MANIFEST('0.1.0') })
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  expect(fetched.length).toBe(2)
  expect(toasts).toEqual([])
})

test('the first check only learns the catalogue', async ($, on) => {
  const { clock, toasts } = world(on, { market: MARKET(['trace', 'agents']), manifest: MANIFEST('0.1.0') })
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  expect(toasts).toEqual([])
})

test('a mod added since the last check is announced', async ($, on) => {
  const { clock, toasts } = world(
    on,
    { market: MARKET(['trace', 'agents']), manifest: MANIFEST('0.1.0') },
    { 'updates.seen': ['trace'], 'updates.lastCheck': 0 },
  )
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  expect(toasts).toEqual(['New in camplified: agents. Install with: /plugin install agents --marketplace dimay7/camplified'])
})

test('a mod already announced is not announced again', async ($, on) => {
  const { clock, toasts } = world(
    on,
    { market: MARKET(['trace', 'agents']), manifest: MANIFEST('0.1.0') },
    { 'updates.seen': ['trace', 'agents'], 'updates.lastCheck': 0 },
  )
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  expect(toasts).toEqual([])
})

test('it checks at most once a day', async ($, on) => {
  const { clock, fetched } = world(on, { market: MARKET(['trace']), manifest: MANIFEST('0.1.0') })
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  await clock.advance(60 * 60 * 1000)
  await startSession($, clock)
  expect(fetched.length).toBe(2)
})

test('offline, it stays quiet', async ($, on) => {
  const { clock, toasts } = world(on, { offline: true })
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  expect(toasts).toEqual([])
})

test('turned off, it never fetches', { options: { checkForUpdates: false } }, async ($, on) => {
  const { clock, fetched } = world(on, { market: MARKET(['trace']), manifest: MANIFEST('0.2.0') })
  await clock.set(1_700_000_000_000)
  await startSession($, clock)
  expect(fetched).toEqual([])
})
