/** A run of text in one style, as the status line's ANSI codes set it. */
export type Span = {
  text: string
  color?: string
  isBold?: boolean
  isDim?: boolean
  isItalic?: boolean
  isUnderline?: boolean
}

/** What the band shows: the lines the status line printed, and where they came from. */
export type Line = {
  rows: Span[][]
  /** `command`: the person's statusLine printed it; `builtin`: none is set, or it failed. */
  source: 'command' | 'builtin'
  /** Why the command's output is not shown, when it failed. */
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    statusbar: {
      line: Shaped<Line | null>
      /** Lines the session's edits and writes added and removed. */
      lines: Shaped<{ added: number; removed: number }>
      hidden: boolean
    }
  }
}
