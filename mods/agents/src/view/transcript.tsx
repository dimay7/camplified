import type { EngineInterface } from 'claude-code'

import type { AgentRun, Transcript } from '../../types'
import { clock } from '../format'
import { LIVE, updateTranscript } from '../state'
import type { Kit } from './kit'
import { MUTED, RED, ROW_HOVER, typeColor } from './theme'

/** One agent's conversation, drawn in place of the list until closed. */
export function transcriptView($: EngineInterface, k: Kit, shown: Transcript, run: AgentRun | undefined) {
  const { at, Box, Text, Button, Markdown, icon, label } = k
  const color = run ? typeColor(run.type) : MUTED
  const isLive = run ? LIVE.has(run.status) : false

  return (
    <Box flexDirection="column" gap="sm">
      <Box paddingX="sm">
        <Button
          key="transcript-back"
          label="‹ All agents"
          plain
          dimColor
          onPress={() => void updateTranscript($, () => null)}
        />
      </Box>
      <Box flexDirection="column" paddingX="sm">
        <Box flexDirection="row" alignItems="center" gap="sm">
          {icon(run?.status ?? 'completed', color)}
          <Box flexGrow={1} flexShrink={1}>
            <Text size="footnote" weight="medium" wrap="truncate-end">
              {run?.description || run?.type || 'Agent'}
            </Text>
          </Box>
          {run && (
            <Text size="caption" mono tabular dimColor>
              {clock((run.endedAt ?? at) - run.startedAt)}
            </Text>
          )}
        </Box>
        {run && (
          <Box marginLeft="lg">
            <Text size="caption" dimColor>
              {[run.type, run.model, `${run.tools} tool calls`, isLive ? 'updating live' : run.status]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
          </Box>
        )}
      </Box>

      {shown.isLoading && (
        <Box paddingX="sm">
          <Text size="caption" dimColor>
            Loading the transcript…
          </Text>
        </Box>
      )}
      {shown.deny && (
        <Box paddingX="sm" flexDirection="column" gap="xs">
          <Text size="caption" color={RED}>
            Couldn't read this transcript.
          </Text>
          <Text size="caption" dimColor wrap="wrap">
            {shown.deny}
          </Text>
        </Box>
      )}

      {shown.entries.map((entry, index) => {
        if (entry.kind === 'prompt' || entry.kind === 'message')
          return (
            <Box flexDirection="column" paddingX="sm">
              {label(entry.kind === 'prompt' ? 'Prompt' : 'Message')}
              <Text size="caption" wrap="wrap">
                {entry.text}
              </Text>
            </Box>
          )
        if (entry.kind === 'thinking')
          return (
            <Box paddingX="sm">
              <Text size="caption" italic dimColor wrap="wrap">
                {entry.text}
              </Text>
            </Box>
          )
        if (entry.kind === 'text')
          return (
            <Box paddingX="sm">
              <Markdown text={entry.text} />
            </Box>
          )
        if (entry.kind === 'call')
          return (
            <Box key={`entry-${index}`} flexDirection="row" gap="xs" paddingX="sm" hover={{ backgroundColor: ROW_HOVER }}>
              <Text size="caption" color={color}>
                ›
              </Text>
              <Text size="caption" weight="medium">
                {entry.tool ?? 'tool'}
              </Text>
              <Box flexShrink={1}>
                <Text size="caption" mono dimColor wrap="truncate-end">
                  {entry.text}
                </Text>
              </Box>
            </Box>
          )
        return (
          <Box paddingX="sm" marginLeft="lg">
            <Text size="caption" mono wrap="wrap" color={entry.isError ? RED : undefined} dimColor={!entry.isError}>
              {entry.text}
            </Text>
          </Box>
        )
      })}
      {!shown.isLoading && !shown.deny && shown.entries.length === 0 && (
        <Box paddingX="sm">
          <Text size="caption" dimColor>
            Nothing in this transcript yet.
          </Text>
        </Box>
      )}
    </Box>
  )
}
