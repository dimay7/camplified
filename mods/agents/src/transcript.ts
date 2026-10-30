import type { EngineInterface } from 'claude-code'

import type { TranscriptEntry } from '../types'
import { clip, detailOf } from './format'
import { updateTranscript } from './state'

const KEEP_ENTRIES = 300

type Block = { type: string; [field: string]: unknown }

const blockText = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map(b => (b && typeof b === 'object' && (b as Block).type === 'text' ? String((b as Block).text ?? '') : ''))
          .filter(Boolean)
          .join('\n')
      : ''

// The engine's own reminders ride in user turns; they are not the conversation.
const isReminder = (text: string) => /^\s*<system-reminder>/.test(text)

/** An agent's messages, in Messages API form, flattened into the steps a person reads. */
export function toEntries(messages: readonly { role: string; content: readonly Block[] }[]) {
  const out: TranscriptEntry[] = []
  messages.forEach((message, index) => {
    for (const block of message.content) {
      if (block.type === 'text') {
        const text = String(block.text ?? '').trim()
        if (!text || isReminder(text)) continue
        const kind = message.role === 'assistant' ? 'text' : out.length === 0 && index === 0 ? 'prompt' : 'message'
        out.push({ kind, text: clip(text, 2000) })
      } else if (block.type === 'thinking') {
        const text = String(block.thinking ?? '').trim()
        if (text) out.push({ kind: 'thinking', text: clip(text, 400) })
      } else if (block.type === 'tool_use') {
        const input = (block.input ?? {}) as Record<string, unknown>
        out.push({ kind: 'call', tool: String(block.name ?? 'tool'), text: clip(detailOf(input) || JSON.stringify(input), 300) })
      } else if (block.type === 'tool_result') {
        const text = blockText(block.content).trim()
        out.push({ kind: 'result', text: clip(text || '(no output)', 600), isError: block.is_error === true })
      }
    }
  })
  return out.slice(-KEEP_ENTRIES)
}

/** Reads one agent's conversation into the pane's transcript view. */
export async function loadTranscript($: EngineInterface, agentId: string) {
  const got = await $.session.messages({ agentId, as: 'api' })
  const value = Array.isArray(got)
    ? { agentId, entries: toEntries(got as { role: string; content: Block[] }[]) }
    : { agentId, entries: [], deny: (got as { deny: string }).deny }
  // The person may have gone back to the list, or to another agent, meanwhile.
  await updateTranscript($, t => (t?.agentId === agentId ? value : t))
}

/** Shows an agent's conversation in the pane, replacing the list until closed. */
export async function openTranscript($: EngineInterface, agentId: string) {
  await updateTranscript($, () => ({ agentId, entries: [], isLoading: true }))
  await loadTranscript($, agentId).catch(err =>
    updateTranscript($, t => (t?.agentId === agentId ? { agentId, entries: [], deny: String(err) } : t)),
  )
}
