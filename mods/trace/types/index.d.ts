/** One tool call on a lane: when it started, when it ended (absent while it runs). */
export type Span = {
  ref: string
  tool: string
  detail: string
  start: number
  end?: number
  isError?: boolean
}

/** One loop's row on the timeline: the main session's, or an agent's. */
export type Lane = {
  id: string
  label: string
  type: string
  parentId?: string
  status: string
  startedAt: number
  endedAt?: number
  spans: Span[]
  /** The main session's turns, [start, end]; an agent is busy from start to end. */
  turns?: [number, number | null][]
}

declare module 'claude-code' {
  interface PluginState {
    trace: {
      lanes: Shaped<Record<string, Lane>>
      now: number
      /** How far back the chart reaches, in ms; 0 for the whole session. */
      window: number
    }
  }
}
