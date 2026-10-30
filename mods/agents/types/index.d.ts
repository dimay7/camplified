export type CallRecord = {
  ref: string
  tool: string
  detail: string
  at: number
  ms?: number
  isError?: boolean
}

export type AgentRun = {
  id: string
  type: string
  description: string
  status: string
  parentId?: string
  startedAt: number
  endedAt?: number
  tools: number
  current?: { tool: string; detail: string; ref: string }
  last?: { tool: string; detail: string }
  ticks: number[]
  /** Output tokens so far, summed over the agent's model calls. */
  tokens: number
  /** Model calls made so far. */
  steps?: number
  /** The prompt size of its latest model call: how full its context is. */
  context?: number
  calls: CallRecord[]
  prompt?: string
  model?: string
  answer?: string
}

/** One step of an agent's conversation, as the in-pane transcript draws it. */
export type TranscriptEntry = {
  kind: 'prompt' | 'message' | 'text' | 'thinking' | 'call' | 'result'
  text: string
  tool?: string
  isError?: boolean
}

export type Transcript = {
  agentId: string
  entries: TranscriptEntry[]
  deny?: string
  isLoading?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agents': {
      runs: Shaped<Record<string, AgentRun>>
      main: { tool: string; detail: string; ref: string } | null
      now: number
      mainTurn: number
      mainContext: number
      showDone: boolean
      expanded: string[]
      transcript: Transcript | null
    }
  }
}
