import type { EngineInterface, On } from 'claude-code'

import type { Span } from '../types'
import type { Segment } from './bars'
import { BAR_SIZE, barSvg, groups, segments } from './bars'
import { readHidden, readLine, setHidden } from './state'

const HIDDEN_KEY = 'band.hidden'

/** Registers `/statusbar` and restores whether the person hid the line. */
export async function startBand($: EngineInterface) {
  await $.command.register({ name: 'statusbar', description: 'Show or hide your status line above the prompt' })
  // Fail-safe: a store that cannot be read leaves the line showing.
  const isHidden = Boolean(await $.store.get(HIDDEN_KEY).catch(() => false))
  await setHidden($, isHidden)
}

/** Draws the status line above the prompt, on every surface but the terminal. */
export function band(on: On) {
  on('command.run', { command: 'statusbar' }, async ($, e, next) => {
    const isHidden = !(await readHidden($))
    await setHidden($, isHidden)
    await $.store.set(HIDDEN_KEY, isHidden).catch(() => undefined)
    return { text: isHidden ? 'Status line hidden. Run /statusbar to show it.' : 'Status line shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The terminal draws the CLI's own status line under the prompt.
    if (e.surface === 'terminal' || e.props.hasSurvey) return next(e)
    const line = await readLine($)
    if (!line || (await readHidden($))) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    // The surfaces that draw vector images get real bars; any other keeps the characters.
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const text = (key: string, spans: Span[]) => (
      <Text key={key} size="footnote" tabular>
        {spans.map((s, j) => (
          <Text
            key={`s${j}`}
            color={s.color}
            dimColor={s.isDim}
            weight={s.isBold ? 'semibold' : undefined}
            italic={s.isItalic}
            underline={s.isUnderline}
          >
            {s.text}
          </Text>
        ))}
      </Text>
    )

    // A bar sits a small gap from its label; a space printed beside it would double that.
    const trimNextToBars = (segs: Segment[]) =>
      segs.map((seg, j) => {
        if (seg.kind !== 'text') return seg
        const spans = seg.spans.map(s => ({ ...s }))
        const first = spans[0]
        const last = spans[spans.length - 1]
        if (first && segs[j - 1]?.kind === 'bar') first.text = first.text.trimStart()
        if (last && segs[j + 1]?.kind === 'bar') last.text = last.text.trimEnd()
        return { ...seg, spans }
      })

    return (
      <Box flexDirection="column" rowGap="sm">
        {line.rows.map((row, i) => (
          <Box key={`r${i}`} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="lg" rowGap="xs">
            {groups(row).map((group, g) => (
              <Box key={`g${g}`} flexDirection="row" alignItems="center" columnGap="xs">
                {trimNextToBars(segments(group)).map((seg, j) =>
                  seg.kind === 'text'
                    ? text(`t${j}`, seg.spans)
                    : Svg
                      ? <Svg key={`b${j}`} source={barSvg(seg.fill, seg.color)} alt={`${Math.round(seg.fill * 100)}%`} {...BAR_SIZE} />
                      : text(`t${j}`, [{ text: seg.text, color: seg.color }]),
                )}
              </Box>
            ))}
          </Box>
        ))}
        {line.error ? (
          <Text size="caption" dimColor wrap="truncate-end">
            {`statusLine command failed (${line.error}); showing the built-in line`}
          </Text>
        ) : null}
      </Box>
    )
  })
}
