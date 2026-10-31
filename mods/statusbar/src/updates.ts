import type { EngineInterface } from 'claude-code'

// Where the published catalogue lives. Each camplified mod checks itself
// against it; nothing is installed or changed, only a toast is shown.
const REPO = 'dimay7/camplified'
const RAW = `https://raw.githubusercontent.com/${REPO}/main`
const DAY_MS = 24 * 60 * 60 * 1000
// Long enough to read a command off the toast.
const TOAST_MS = 15_000

type Marketplace = { name: string; plugins: { name: string; source: string }[] }
type Manifest = { name: string; version: string }

/** 1.10.0 is newer than 1.9.3: compares dotted numbers part by part. */
export function isNewer(remote: string, local: string) {
  const a = remote.split('.').map(n => parseInt(n, 10) || 0)
  const b = local.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff) return diff > 0
  }
  return false
}

async function fetchJson($: EngineInterface, url: string): Promise<unknown> {
  const res = await $.http.fetch(url)
  return res.ok ? JSON.parse(res.text) : undefined
}

/**
 * Once a day at most: tells the person when this mod has a newer version on
 * GitHub, and when the catalogue has gained a mod since they last looked.
 * Quiet on any failure (offline, blocked, a malformed reply).
 */
export async function checkForUpdates($: EngineInterface) {
  const at = await $.clock.now()
  const last = Number((await $.store.get('updates.lastCheck')) ?? 0)
  if (at - last < DAY_MS) return
  await $.store.set('updates.lastCheck', at)

  const mine = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) as Manifest
  const market = (await fetchJson($, `${RAW}/.claude-plugin/marketplace.json`)) as Marketplace | undefined
  if (!market?.plugins) return

  const notes: string[] = []
  const entry = market.plugins.find(p => p.name === mine.name)
  if (entry) {
    const path = entry.source.replace(/^\.\//, '')
    const remote = (await fetchJson($, `${RAW}/${path}/.claude-plugin/plugin.json`)) as Manifest | undefined
    if (remote?.version && isNewer(remote.version, mine.version))
      notes.push(
        `camplified: ${mine.name} ${remote.version} is out (you have ${mine.version}). ` +
          `Run: claude plugin update ${mine.name}@${market.name}, then /reload-plugins`,
      )
  }

  // The first check only learns the catalogue: everything in it is not news.
  const names = market.plugins.map(p => p.name)
  const seen = (await $.store.get('updates.seen')) as string[] | undefined
  const fresh = seen ? names.filter(n => !seen.includes(n) && n !== mine.name) : []
  if (fresh.length)
    notes.push(
      `New in camplified: ${fresh.join(', ')}. Install with: /plugin install ${fresh[0]} --marketplace ${REPO}`,
    )
  await $.store.set('updates.seen', names)

  for (const note of notes) $.ui.toast(note, { timeoutMs: TOAST_MS })
}

/** Runs the check a few seconds after start, so a surface is there to show it. */
export function startUpdates($: EngineInterface) {
  $.clock.after(5000, () => void checkForUpdates($).catch(() => undefined))
}
