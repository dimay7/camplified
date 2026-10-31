# Changelog

Each mod is versioned on its own; entries are grouped by mod, newest first.

## statusbar

### 0.1.2

- Less dense: the `|` separators a status line prints between its parts become space, the two lines have room between them, and a bar sits a small gap from its label.
- A line too long for the window wraps between its parts instead of being cut off.

### 0.1.1

- The line is drawn in the app's own font, not a monospaced one, at the footnote size, with digits of one width so the timer holds still.
- A progress bar drawn in block characters (`███····`) becomes a thin bar, which keeps its length in a proportional font.

### 0.1.0

- Runs the `statusLine` command you set for the CLI, with the input the CLI gives it, and draws its output above the desktop app's prompt, colours and all.
- A built-in line when none is set, or when the command fails, with a dim row saying why.
- Nothing in the terminal, which keeps the CLI's own status line.
- `/statusbar` hides and shows the line.
- Daily update check, off in the mod's settings.

## trace

### 0.1.1

- A pane you close stays closed, in later sessions too, until you run `/trace-pane`.
- The README shows the pane, drawn from sample data.

### 0.1.0

- A lane per loop, the main session's and each subagent's, nested under the agent that started it.
- Every tool call as a bar as long as it took, coloured by kind, red when it failed, pulsing while it runs.
- A thin line where a loop was busy between calls, and an amber stretch where a running agent has gone a minute without a tool call.
- Window chips: 30 seconds, 2 minutes, 10 minutes, the whole session.
- The slowest calls in the window, how many loops are busy now, where the tool time went, and how many calls failed.
- Daily update check, off in the mod's settings.

## agents

### 0.1.1

- A pane you close stays closed, in later sessions too, until you run `/agent-pane`.
- The README shows the pane, drawn from sample data.

### 0.1.0

- Live side pane of every subagent, nested under the agent that started it.
- Each row shows the current tool, tool calls, output tokens, context size, an activity chart, and an amber hint when an agent goes a minute without a tool call.
- The main session's state, turn timer and context size at the top.
- Row details: prompt, recent tool calls with timings, result.
- Open transcript: an agent's whole conversation in the pane, live while it runs.
- Daily update check, off in the mod's settings.
