import type { EngineInterface, RenderInput } from 'claude-code'

import type { AgentRun } from '../../types'
import { buckets, SPARK_BUCKET_MS, SPARK_BUCKETS } from '../state'
import { iconFor, sparkSvg, sparkText } from './glyphs'
import { RED } from './theme'

/**
 * What every view draws with: the surface's elements, the time the drawing
 * is for, and the few marks the views share. The engine interface itself is
 * never kept in an object, so views take `$` as an argument of their own.
 */
export function makeKit($: EngineInterface, e: RenderInput<'Pane'>, at: number) {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button, Markdown } = ui
  // The terminal draws no vector marks; it gets glyphs instead.
  const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined

  const icon = (status: string, color: string) => {
    const { svg, glyph } = iconFor(status, color)
    return Svg ? (
      <Svg source={svg} alt={status} width={12} height={12} />
    ) : (
      <Text color={status === 'failed' ? RED : color}>{glyph}</Text>
    )
  }

  const spark = (run: AgentRun, color: string) => {
    const counts = buckets(run.ticks, at)
    const recent = counts.reduce((sum, c) => sum + c, 0)
    const firstSlot = Math.max(0, SPARK_BUCKETS - 1 - Math.floor((at - run.startedAt) / SPARK_BUCKET_MS))
    const tip = `Tool calls per 10 s over the last 2 min (now at the right): ${recent} in all`
    return Svg ? (
      <Svg source={sparkSvg(counts, color, firstSlot, tip)} alt={tip} width={48} height={14} isInteractive />
    ) : (
      <Text mono color={color} size="caption">
        {sparkText(counts)}
      </Text>
    )
  }

  const label = (text: string) => (
    <Text size="caption" weight="semibold" dimColor>
      {text}
    </Text>
  )

  return { at, Box, Text, Button, Markdown, icon, spark, label }
}

export type Kit = ReturnType<typeof makeKit>
