# Changelog

Each mod is versioned on its own; entries are grouped by mod, newest first.

## trace

### 0.1.0

- A lane per loop, the main session's and each subagent's, nested under the agent that started it.
- Every tool call as a bar as long as it took, coloured by kind, red when it failed, pulsing while it runs.
- A thin line where a loop was busy between calls, and an amber stretch where a running agent has gone a minute without a tool call.
- Window chips: 30 seconds, 2 minutes, 10 minutes, the whole session.
- The slowest calls in the window, how many loops are busy now, where the tool time went, and how many calls failed.
- Daily update check, off in the mod's settings.

## agents

### 0.1.0

- Live side pane of every subagent, nested under the agent that started it.
- Each row shows the current tool, tool calls, output tokens, context size, an activity chart, and an amber hint when an agent goes a minute without a tool call.
- The main session's state, turn timer and context size at the top.
- Row details: prompt, recent tool calls with timings, result.
- Open transcript: an agent's whole conversation in the pane, live while it runs.
- Daily update check, off in the mod's settings.
