import type { EngineInterface, On } from 'claude-code'

import {
  PANE,
  TITLE,
  readExpanded,
  readMain,
  readMainContext,
  readMainTurn,
  readNow,
  readRuns,
  readShowDone,
  readTranscript,
} from '../state'
import { makeKit } from './kit'
import { listView } from './list'
import { transcriptView } from './transcript'

/** Registers the slash command and opens the pane, once the session is ready. */
export async function startPane($: EngineInterface) {
  await $.command.register({
    // Literal names, here and in the matchers below: the engine reads them off the source.
    name: 'agent-pane',
    description: 'Show the live subagent list in the side pane',
  })
  void $.ui.open({ id: PANE, title: TITLE })
}

/** The side pane and its slash command: reads state, draws, writes nothing on its own. */
export function pane(on: On) {
  on('command.run', { command: 'agent-pane' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Agents pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: 'agents' }, async ($, e) => {
    const all = Object.values(await readRuns($))
    const turnStart = await readMainTurn($)
    const at = Math.max(await readNow($), turnStart, ...all.map(r => r.endedAt ?? r.startedAt))
    const k = makeKit($, e, at)

    const shown = await readTranscript($)
    if (shown) return transcriptView($, k, shown, all.find(r => r.id === shown.agentId))

    return listView($, k, {
      all,
      opened: new Set(await readExpanded($)),
      showFinished: await readShowDone($),
      viewing: e.props.view.agentId,
      mainCall: await readMain($),
      mainCtx: await readMainContext($),
      turnStart,
    })
  })
}
