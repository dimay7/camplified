import type { EngineInterface, On } from 'claude-code'

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

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {line.rows.map((row, i) => (
          <Text key={`r${i}`} size="footnote" mono tabular wrap="truncate-end">
            {row.map((s, j) => (
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
