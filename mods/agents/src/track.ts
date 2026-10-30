import type { EngineInterface, On } from 'claude-code'

import type { CallRecord } from '../types'
import { detailOf } from './format'
import {
  KEEP_CALLS,
  LIVE,
  SPARK_BUCKET_MS,
  SPARK_BUCKETS,
  blank,
  prune,
  readMainTurn,
  readRuns,
  readTranscript,
  setMainContext,
  setMainTurn,
  setNow,
  updateMain,
  updateRuns,
} from './state'
import { loadTranscript } from './transcript'

/**
 * Starts the once-a-second sync with the engine's agent list. The list is the
 * source of status, type and description; the hooks in `track` fill in the
 * rest as it happens.
 */
export function startTracking($: EngineInterface) {
  const sync = async () => {
    const at = await $.clock.now()
    const list = await $.agent.list()
    const before = await readRuns($)
    const seen = new Set(list.map(a => a.id))
    const anyLive =
      list.some(a => LIVE.has(a.status)) ||
      Object.values(before).some(r => LIVE.has(r.status)) ||
      (await readMainTurn($)) > 0
    const changed = list.some(a => {
      const r = before[a.id]
      return !r || r.status !== a.status || r.description !== a.description || r.type !== a.type
    })
    if (!anyLive && !changed) return

    await updateRuns($, all => {
      const nextRuns = { ...all }
      for (const a of list) {
        const prev = nextRuns[a.id] ?? blank(a.id, at)
        const live = LIVE.has(a.status)
        nextRuns[a.id] = {
          ...prev,
          type: a.type,
          description: a.description || prev.description,
          status: a.status,
          parentId: a.parentId,
          endedAt: live ? undefined : (prev.endedAt ?? at),
          current: live ? prev.current : undefined,
        }
      }
      for (const [id, r] of Object.entries(nextRuns)) {
        if (!seen.has(id) && LIVE.has(r.status) && at - r.startedAt > 5000)
          nextRuns[id] = { ...r, status: 'completed', endedAt: at, current: undefined }
      }
      return prune(nextRuns)
    })
    await setNow($, at)
  }

  // An open transcript of a running agent follows it every other second.
  let ticks = 0
  const refresh = async () => {
    const t = await readTranscript($)
    if (!t || t.isLoading) return
    const run = (await readRuns($))[t.agentId]
    if (run && LIVE.has(run.status)) await loadTranscript($, t.agentId)
  }
  $.clock.every(1000, () => {
    void sync().catch(() => undefined)
    if (++ticks % 2 === 0) void refresh().catch(() => undefined)
  })
}

/**
 * Turns the engine's events into the pane's state: what each agent is doing
 * and what it has spent. Draws nothing.
 */
export function track(on: On) {
  // Observe only: a failure here is swallowed so the tool always runs.
  on('tool.call', async ($, e, next) => {
    const call = { tool: e.tool, detail: detailOf(e as Record<string, unknown>), ref: e.tool_use_id }
    const id = e.agentId
    try {
      const at = await $.clock.now()
      if (id) {
        await updateRuns($, all => {
          const prev = all[id] ?? blank(id, at)
          return {
            ...all,
            [id]: {
              ...prev,
              tools: prev.tools + 1,
              current: call,
              last: { tool: call.tool, detail: call.detail },
              calls: [...(prev.calls ?? []), { ...call, at }].slice(-KEEP_CALLS),
              ticks: [...prev.ticks.filter(t => at - t < SPARK_BUCKET_MS * SPARK_BUCKETS), at].slice(-200),
            },
          }
        })
      } else {
        await updateMain($, () => call)
      }
    } catch {}
    let isError = true
    try {
      const ran = await next(e)
      isError = Boolean(ran.deny || ran.isError)
      return ran
    } finally {
      const end = await $.clock.now().catch(() => undefined)
      const settle = (c: CallRecord): CallRecord =>
        c.ref === call.ref ? { ...c, ms: end === undefined ? undefined : end - c.at, isError } : c
      const clear = id
        ? updateRuns($, all => {
            const run = all[id]
            if (!run) return all
            return {
              ...all,
              [id]: {
                ...run,
                current: run.current?.ref === call.ref ? undefined : run.current,
                calls: (run.calls ?? []).map(settle),
              },
            }
          })
        : updateMain($, m => (m?.ref === call.ref ? null : m))
      await clear.catch(() => undefined)
    }
  })

  // Observe only: remembers what each agent was asked and which model it got.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const id = spawned.agentId
    if (id) {
      try {
        const at = await $.clock.now()
        await updateRuns($, all => {
          const prev = all[id] ?? blank(id, at)
          return {
            ...all,
            [id]: {
              ...prev,
              prompt: e.prompt.slice(0, 4000),
              model: spawned.model,
              description: prev.description || e.description || '',
              type: e.subagentType ?? prev.type,
            },
          }
        })
      } catch {}
    }
    return spawned
  })

  // Observe only: each model call's usage, live, while the agent still runs.
  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)
    const usage = step.usage
    if (usage) {
      const context = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      const id = e.agentId
      try {
        if (id) {
          await updateRuns($, all => {
            const run = all[id]
            if (!run) return all
            return {
              ...all,
              [id]: { ...run, steps: (run.steps ?? 0) + 1, tokens: run.tokens + usage.output_tokens, context },
            }
          })
        } else {
          await setMainContext($, context)
        }
      } catch {}
    }
    return step
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      const at = await $.clock.now().catch(() => 0)
      await setMainTurn($, at).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    if (!id) {
      await setMainTurn($, 0).catch(() => undefined)
      return done
    }
    const at = await $.clock.now()
    await updateRuns($, all => {
      const prev = all[id]
      if (!prev) return all
      return {
        ...all,
        [id]: {
          ...prev,
          // Counted per model call when turn.step saw them; else from the turn's total.
          tokens: prev.steps ? prev.tokens : prev.tokens + (done.usage?.output_tokens ?? 0),
          status: e.reason === 'error' ? 'failed' : e.isAborted ? 'killed' : 'completed',
          endedAt: at,
          current: undefined,
          answer: e.answer.slice(0, 4000),
        },
      }
    })
    return done
  })
}
