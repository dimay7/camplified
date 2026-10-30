import type { EngineInterface, On } from 'claude-code'

import type { Lane, Span } from '../types'
import { detailOf } from './format'
import { LIVE, MAIN, blankLane, prune, readLanes, setNow, updateLanes } from './state'

/** True while anything on the chart still moves: a running call, a turn, a live agent. */
const isActive = (lanes: Lane[]) =>
  lanes.some(
    l =>
      (l.id !== MAIN && LIVE.has(l.status)) ||
      l.spans.some(s => s.end === undefined) ||
      (l.turns ?? []).some(([, end]) => end === null),
  )

/**
 * Starts the once-a-second sync with the engine's agent list (names, types,
 * nesting, status), and moves the clock the chart is drawn at while anything
 * is still running.
 */
export function startTracking($: EngineInterface) {
  const sync = async () => {
    const at = await $.clock.now()
    const list = await $.agent.list()
    const before = await readLanes($)
    const changed = list.some(a => {
      const l = before[a.id]
      return !l || l.status !== a.status || l.label !== (a.description || a.type)
    })
    if (!changed && !isActive(Object.values(before))) return

    await updateLanes($, all => {
      const next = { ...all }
      for (const a of list) {
        const prev = next[a.id] ?? blankLane(a.id, at)
        const live = LIVE.has(a.status)
        next[a.id] = {
          ...prev,
          label: a.description || a.type,
          type: a.type,
          parentId: a.parentId,
          status: a.status,
          endedAt: live ? undefined : (prev.endedAt ?? at),
        }
      }
      return prune(next)
    })
    await setNow($, at)
  }
  $.clock.every(1000, () => void sync().catch(() => undefined))
}

/** Turns tool calls and turns into spans on lanes. Draws nothing. */
export function track(on: On) {
  // Observe only: a failure here is swallowed so the tool always runs.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const ref = e.tool_use_id
    try {
      const at = await $.clock.now()
      const span: Span = { ref, tool: String(e.tool), detail: detailOf(e as Record<string, unknown>), start: at }
      await updateLanes($, all => {
        const lane = all[id] ?? blankLane(id, at)
        return { ...all, [id]: { ...lane, spans: [...lane.spans, span] } }
      })
      await setNow($, at)
    } catch {}
    let isError = true
    try {
      const ran = await next(e)
      isError = Boolean(ran.deny || ran.isError)
      return ran
    } finally {
      const end = await $.clock.now().catch(() => undefined)
      if (end !== undefined)
        await updateLanes($, all => {
          const lane = all[id]
          if (!lane) return all
          const spans = lane.spans.map(s => (s.ref === ref ? { ...s, end, isError } : s))
          return { ...all, [id]: { ...lane, spans } }
        }).catch(() => undefined)
    }
  })

  // The main session is busy from a turn's start to its end; between turns it is idle.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      try {
        const at = await $.clock.now()
        await updateLanes($, all => {
          const lane = all[MAIN] ?? blankLane(MAIN, at)
          const turn: [number, number | null] = [at, null]
          return { ...all, [MAIN]: { ...lane, status: 'running', turns: [...(lane.turns ?? []), turn].slice(-100) } }
        })
        await setNow($, at)
      } catch {}
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    try {
      const at = await $.clock.now()
      const id = e.agentId ?? MAIN
      await updateLanes($, all => {
        const lane = all[id]
        if (!lane) return all
        if (id === MAIN) {
          const turns = (lane.turns ?? []).map(([start, end]): [number, number | null] => [start, end ?? at])
          return { ...all, [MAIN]: { ...lane, status: 'idle', turns } }
        }
        const status = e.reason === 'error' ? 'failed' : e.isAborted ? 'killed' : 'completed'
        return { ...all, [id]: { ...lane, status, endedAt: at } }
      })
      await setNow($, at)
    } catch {}
    return done
  })
}
