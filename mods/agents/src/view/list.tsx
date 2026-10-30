import type { EngineInterface } from 'claude-code'

import type { AgentRun } from '../../types'
import { ago, callTime, clip, clock, compact } from '../format'
import { LIVE, liveTree, toggleExpanded, toggleShowDone } from '../state'
import { openTranscript } from '../transcript'
import type { Kit } from './kit'
import { AMBER, CLAY, RED, ROW_HOVER, typeColor } from './theme'

// A running agent with no tool call for this long is worth a look.
const QUIET_MS = 60_000

export type ListData = {
  all: AgentRun[]
  opened: Set<string>
  showFinished: boolean
  viewing?: string
  mainCall: { tool: string; detail: string } | null
  mainCtx: number
  turnStart: number
}

/** The main session, then every running agent as a tree, then the finished ones. */
export function listView($: EngineInterface, k: Kit, d: ListData) {
  const { at, Box, Text, Button, icon, spark, label } = k

  const tree = liveTree(d.all)
  const done = d.all.filter(r => !LIVE.has(r.status)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  const failed = done.filter(r => r.status === 'failed').length
  const stopped = done.filter(r => r.status === 'killed').length

  const toggle = (id: string) => void toggleExpanded($, id)

  // The terminal's own agent view, switched from its tasks list, is left this way.
  const backToMain = async () => {
    const moved = await $.ui.view({})
    if (moved.deny) $.ui.toast(`Couldn't switch back: ${moved.deny}`)
  }

  // The expanded part of a row: what it was asked, every call it made, what it said.
  const details = (run: AgentRun) => {
    const calls = (run.calls ?? []).slice(-14).reverse()
    return (
      <Box flexDirection="column" gap="sm" marginTop="sm" marginLeft="lg">
        <Text size="caption" dimColor>
          {[
            run.model,
            `${run.tools} tool calls`,
            `started ${clock(at - run.startedAt)} ago`,
            run.steps ? `${run.steps} model calls` : '',
            run.tokens ? `${compact(run.tokens)} tokens out` : '',
            run.context ? `${compact(run.context)} context` : '',
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
        {run.prompt && (
          <Box flexDirection="column">
            {label('Prompt')}
            <Text size="caption" wrap="wrap">
              {clip(run.prompt, 600)}
            </Text>
          </Box>
        )}
        <Box flexDirection="column">
          {label('Tool calls')}
          {calls.length === 0 && (
            <Text size="caption" dimColor>
              None yet
            </Text>
          )}
          {calls.map(c => (
            <Box flexDirection="row" alignItems="center" gap="sm">
              <Text
                size="caption"
                color={c.isError ? RED : c.ms === undefined ? AMBER : undefined}
                dimColor={!c.isError && c.ms !== undefined}
              >
                {c.isError ? '✕' : c.ms === undefined ? '◌' : '✓'}
              </Text>
              <Text size="caption" weight="medium">
                {c.tool}
              </Text>
              <Box flexGrow={1} flexShrink={1}>
                <Text size="caption" mono dimColor wrap="truncate-end">
                  {c.detail}
                </Text>
              </Box>
              <Text size="caption" mono tabular dimColor>
                {callTime(c)}
              </Text>
            </Box>
          ))}
        </Box>
        {run.answer && (
          <Box flexDirection="column">
            {label('Result')}
            <Text size="caption" wrap="wrap">
              {clip(run.answer, 800)}
            </Text>
          </Box>
        )}
        <Box flexDirection="row" gap="sm">
          <Button
            key={`view-${run.id}`}
            label="Open transcript"
            variant="secondary"
            onPress={() => void openTranscript($, run.id)}
          />
          <Button key={`fold-${run.id}`} label="Collapse" plain dimColor onPress={() => toggle(run.id)} />
        </Box>
      </Box>
    )
  }

  // A running row's third line: its activity chart, then what it has spent so far.
  const stats = (run: AgentRun, color: string) => {
    const calls = run.calls ?? []
    const running = run.current ? calls.find(c => c.ref === run.current?.ref) : undefined
    const lastAt = calls.length ? calls[calls.length - 1]?.at : undefined
    const sinceLast = lastAt === undefined ? at - run.startedAt : at - lastAt
    const isQuiet = !run.current && run.status === 'running' && sinceLast >= QUIET_MS
    const pace = running
      ? `${running.tool} for ${ago(at - running.at)}`
      : lastAt === undefined
        ? 'no tool calls yet'
        : isQuiet
          ? `no tool call for ${ago(sinceLast)}`
          : `last call ${ago(sinceLast)} ago`
    return (
      <Box flexDirection="row" alignItems="center" gap="sm" marginLeft="lg">
        {spark(run, color)}
        <Box flexGrow={1} flexShrink={1}>
          <Text size="caption" dimColor wrap="truncate-end">
            {[
              `${run.tools} ${run.tools === 1 ? 'call' : 'calls'}`,
              run.tokens ? `${compact(run.tokens)} out` : '',
              run.context ? `${compact(run.context)} context` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Box>
        <Text size="caption" color={isQuiet ? AMBER : undefined} dimColor={!isQuiet}>
          {pace}
        </Text>
      </Box>
    )
  }

  const agentRow = (run: AgentRun, depth: number, isDone: boolean) => {
    const color = typeColor(run.type)
    const isOpen = d.opened.has(run.id)
    const elapsed = (run.endedAt ?? at) - run.startedAt
    const activity = run.current
      ? run.current
      : run.status === 'running'
        ? { tool: '', detail: run.last ? `thinking · last ${run.last.tool}` : 'starting' }
        : { tool: '', detail: run.status }
    return (
      <Box
        key={isDone ? `done-${run.id}` : run.id}
        flexDirection="column"
        paddingX="sm"
        paddingY="xs"
        marginLeft={depth ? 'lg' : 0}
        hover={{ backgroundColor: ROW_HOVER }}
      >
        <Box flexDirection="row" alignItems="center" gap="sm">
          {icon(run.status, color)}
          <Box flexGrow={1} flexShrink={1}>
            <Button
              key={isDone ? `row-${run.id}` : `card-${run.id}`}
              plain
              dimColor={isDone && !isOpen}
              onPress={() => toggle(run.id)}
            >
              <Text size="footnote" weight="medium" wrap="truncate-end" color={run.status === 'failed' ? RED : undefined}>
                {run.description || run.type}
              </Text>
            </Button>
          </Box>
          {run.id === d.viewing && (
            <Text size="caption" color={color}>
              viewing
            </Text>
          )}
          {isDone && (
            <Text size="caption" dimColor>
              {[`${run.tools} calls`, run.tokens ? `${compact(run.tokens)} out` : ''].filter(Boolean).join(' · ')}
            </Text>
          )}
          <Text size="caption" mono tabular dimColor>
            {clock(elapsed)}
          </Text>
          <Text size="caption" dimColor>
            {isOpen ? '⌄' : '›'}
          </Text>
        </Box>
        {!isDone && (
          <Box flexDirection="row" gap="xs" marginLeft="lg">
            <Text size="caption" color={color}>
              {run.type}
            </Text>
            <Text size="caption" dimColor>
              ·
            </Text>
            {activity.tool && (
              <Text size="caption" weight="medium">
                {activity.tool}
              </Text>
            )}
            <Box flexShrink={1}>
              <Text size="caption" mono={Boolean(activity.tool)} dimColor wrap="truncate-end">
                {activity.detail}
              </Text>
            </Box>
          </Box>
        )}
        {!isDone && stats(run, color)}
        {isOpen && details(run)}
      </Box>
    )
  }

  const mainStatus = d.mainCall || d.turnStart ? 'running' : 'quiet'
  const mainLine = d.mainCall
    ? { tool: d.mainCall.tool, detail: d.mainCall.detail }
    : { tool: '', detail: d.turnStart ? 'thinking' : tree.length ? `waiting on ${tree.length} agents` : 'idle' }

  return (
    <Box flexDirection="column" gap="xs">
      <Box flexDirection="column" paddingX="sm" paddingY="xs">
        <Box flexDirection="row" alignItems="center" gap="sm">
          {icon(mainStatus, CLAY)}
          <Box flexGrow={1}>
            <Text size="footnote" weight="medium">
              Main session
            </Text>
          </Box>
          {d.turnStart > 0 && (
            <Text size="caption" mono tabular dimColor>
              {clock(at - d.turnStart)}
            </Text>
          )}
        </Box>
        <Box flexDirection="row" gap="xs" marginLeft="lg">
          {mainLine.tool && (
            <Text size="caption" weight="medium">
              {mainLine.tool}
            </Text>
          )}
          <Box flexGrow={1} flexShrink={1}>
            <Text size="caption" mono={Boolean(mainLine.tool)} dimColor wrap="truncate-end">
              {mainLine.detail}
            </Text>
          </Box>
          {d.mainCtx > 0 && (
            <Text size="caption" dimColor>
              {compact(d.mainCtx)} context
            </Text>
          )}
        </Box>
        {d.viewing && (
          <Box marginLeft="lg" marginTop="xs">
            <Button key="back-to-main" label="Back to main transcript" plain dimColor onPress={() => void backToMain()} />
          </Box>
        )}
      </Box>

      {tree.length > 0 && (
        <Box paddingX="sm" marginTop="sm">
          {label(`Running · ${tree.length}`)}
        </Box>
      )}
      {tree.map(({ run, depth }) => agentRow(run, depth, false))}

      {tree.length === 0 && done.length === 0 && (
        <Box paddingX="sm" marginTop="sm">
          <Text size="caption" dimColor>
            No subagents yet. They'll show up here as they start.
          </Text>
        </Box>
      )}

      {done.length > 0 && (
        <Box paddingX="sm" marginTop="sm">
          <Button
            key="toggle-done"
            label={`Finished · ${done.length}${failed ? ` · ${failed} failed` : ''}${stopped ? ` · ${stopped} stopped` : ''}  ${d.showFinished ? '⌄' : '›'}`}
            plain
            dimColor
            onPress={() => void toggleShowDone($)}
          />
        </Box>
      )}
      {d.showFinished && done.slice(0, 30).map(run => agentRow(run, 0, true))}
    </Box>
  )
}
