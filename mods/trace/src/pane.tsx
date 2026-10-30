import type { EngineInterface, On } from 'claude-code'

import { MIN_WIDTH, chartSvg, rowsFor, summarize, windowStart } from './chart'
import { clip, seconds } from './format'
import { ERROR_COLOR, KIND_COLORS, KIND_LABELS, kindOf } from './kinds'
import { readLanes, readNow, readWindow, setWindow } from './state'

// A pane's width arrives in cells of its code font; this turns cells into
// CSS pixels, so the chart is drawn at its size on screen and never stretched.
const CELL_PX = 7.2

const WINDOWS: [string, number][] = [
  ['30s', 30_000],
  ['2m', 120_000],
  ['10m', 600_000],
  ['all', 0],
]

/** Registers the slash command and opens the pane, once the session is ready. */
export async function startPane($: EngineInterface) {
  await $.command.register({
    // Literal names, here and in the matchers below: the engine reads them off the source.
    name: 'trace-pane',
    description: 'Show the timeline of every agent’s tool calls in the side pane',
  })
  void $.ui.open({ id: 'trace', title: 'Trace' })
}

/** The side pane and its slash command: reads state, draws, writes only the chosen window. */
export function pane(on: On) {
  on('command.run', { command: 'trace-pane' }, async $ => {
    await $.ui.open({ id: 'trace', title: 'Trace' })

    return { text: 'Trace pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: 'trace' }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The terminal draws no vector art; it gets a line per lane instead.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined

    const lanes = Object.values(await readLanes($))
    const windowMs = await readWindow($)
    const latest = lanes.flatMap(l => [l.startedAt, l.endedAt ?? 0, ...l.spans.map(s => s.end ?? s.start)])
    const at = Math.max(await readNow($), ...latest)
    const from = windowStart(lanes, at, windowMs)
    const rows = rowsFor(lanes, from)
    const sum = summarize(rows, from, at)
    const hasCalls = lanes.some(l => l.spans.length > 0)

    const label = (text: string) => (
      <Text size="caption" weight="semibold" dimColor>
        {text}
      </Text>
    )

    return (
      <Box flexDirection="column" gap="xs">
        {/* The pane's tab already says Trace: the top row is the window chips alone. */}
        <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap="sm" paddingX="sm">
          {WINDOWS.map(([name, ms]) => (
            <Button
              key={`window-${name}`}
              label={name}
              plain
              dimColor={ms !== windowMs}
              onPress={() => void setWindow($, ms)}
            />
          ))}
        </Box>

        {!hasCalls && (
          <Box paddingX="sm">
            <Text size="caption" dimColor>
              No tool calls yet. They'll show up here as Claude and its agents work.
            </Text>
          </Box>
        )}

        {hasCalls && Svg && (
          <Svg
            source={chartSvg(rows, from, at, sum.kinds, sum.errors > 0, Math.max(MIN_WIDTH, e.props.bodyColumns * CELL_PX))}
            alt={`Timeline of ${rows.length} lanes of tool calls over the chosen window`}
          />
        )}
        {hasCalls &&
          !Svg &&
          rows.map(({ lane, depth }) => {
            const calls = lane.spans.filter(s => (s.end ?? at) >= from)
            return (
              <Box flexDirection="row" gap="sm" paddingX="sm" marginLeft={depth ? 'lg' : 0}>
                <Box flexGrow={1} flexShrink={1}>
                  <Text size="caption" wrap="truncate-end">
                    {lane.label}
                  </Text>
                </Box>
                <Text size="caption" dimColor>
                  {calls.length} calls
                </Text>
              </Box>
            )
          })}

        {sum.slowest.length > 0 && (
          <Box flexDirection="column" paddingX="sm">
            {label('Slowest calls')}
            {sum.slowest.map(s => (
              <Box flexDirection="row" alignItems="center" gap="sm">
                <Text size="caption" color={KIND_COLORS[kindOf(s.tool)]}>
                  ■
                </Text>
                <Text size="caption" weight="medium">
                  {s.tool}
                </Text>
                <Box flexGrow={1} flexShrink={1}>
                  <Text size="caption" mono dimColor wrap="truncate-end">
                    {s.detail}
                  </Text>
                </Box>
                <Text size="caption" mono tabular dimColor>
                  {`${seconds(s.ms)}${s.isRunning ? ' so far' : ''} · ${clip(s.lane, 18)}`}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {hasCalls && (
          <Box flexDirection="row" gap="md" paddingX="sm">
            <Text size="caption" dimColor>
              {`${sum.parallel} in parallel now`}
            </Text>
            {sum.topKind && (
              <Text size="caption" dimColor>
                {`${Math.round(sum.topKind.share * 100)}% of tool time in ${KIND_LABELS[sum.topKind.kind]}`}
              </Text>
            )}
            <Text size="caption" color={sum.errors ? ERROR_COLOR : undefined} dimColor={!sum.errors}>
              {`${sum.errors} ${sum.errors === 1 ? 'error' : 'errors'}`}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
