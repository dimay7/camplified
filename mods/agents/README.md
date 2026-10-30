# agents

A live side pane of every subagent Claude Code is running: what each one is doing right now, what it has spent, and everything it said and did.

![The agents pane: the main session, three running subagents with what each is doing and has spent, and the finished ones folded below](docs/pane.svg)

<sub>Sample data.</sub>

## What it shows

- **Every running agent as a row**, nested under the agent that started it, with a spinning ring in its type's colour, its task, and a timer.
- **What it is doing now**: the tool and its argument (`Bash  cargo test`), or "thinking" between calls.
- **What it has spent**, live: tool calls, output tokens, and context size. Context is the prompt size of its latest model call, so you can see an agent filling its window.
- **An activity chart**: tool calls per 10 seconds over the last two minutes, now at the right edge. Hover it for the count.
- **A stuck-agent hint**: "no tool call for 1:10" turns amber once a running agent has gone a minute without a tool call.
- **The main session** at the top: "thinking" with a timer during a turn, the tool it runs, its context size, "idle" between turns.
- **Finished agents**, folded under "Finished", with failed and stopped ones counted apart.

Click any row to open its details: the prompt it was given, its last tool calls with how long each took (✓, ✕ or running), its result, and **Open transcript**, which shows the agent's whole conversation in the pane: its replies, every tool call with its output, and its thinking. A running agent's transcript updates live.

## Install

```
/plugin install agents --marketplace dimay7/camplified
```

The pane opens on its own when a session starts. Close it and it stays closed, in later sessions too, until you run `/agent-pane`.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Check for updates | on | Once a day, looks on GitHub for a newer version of this mod and for new camplified mods, and says so in a toast. Nothing is installed automatically. |

## How it works

The mod only observes: it never blocks, changes or slows a tool call, and a failure inside it is swallowed so your session carries on.

- `src/track.ts` turns the engine's events (tool calls, model calls, agent starts and ends) into state.
- `src/state.ts` is the only file that reads or writes that state.
- `src/view/` draws it: `list.tsx` for the rows, `transcript.tsx` for a conversation, `glyphs.ts` for the small vector marks.
- `src/updates.ts` is the daily update check.

Token counts come from each model call as it finishes, so they lag the live conversation by at most one call. The pane reads transcripts through the engine; if Claude Code has not kept an agent's transcript, the pane says why instead.

## Develop

```bash
claude plugin validate mods/agents
claude plugin test mods/agents
```
