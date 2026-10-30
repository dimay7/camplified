# Changelog

Each mod is versioned on its own; entries are grouped by mod, newest first.

## agents

### 0.1.0

- Live side pane of every subagent, nested under the agent that started it.
- Each row shows the current tool, tool calls, output tokens, context size, an activity chart, and an amber hint when an agent goes a minute without a tool call.
- The main session's state, turn timer and context size at the top.
- Row details: prompt, recent tool calls with timings, result.
- Open transcript: an agent's whole conversation in the pane, live while it runs.
- Daily update check, off in the mod's settings.
