# trace

A timeline of every tool call Claude Code and its subagents make: what ran in parallel, what was slow, and where an agent sat idle.

```
Trace                                   30s  2m  10m  all
               -2m      -90s     -1m      -30s      now
● Main session  ▮▏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┊
● Review loader   ▏▮▮▮▮▏ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮        ▮▮▮┊
  ● ↳ Find call sites   ▮▮▮▮▮▮▮ done                 ┊
● Scan the corpus ▮▮▮▮━━━━━ no tool call for 1:31 ━━━┊
● Plan the rebrand                     ▮▮▮▮▏        ┊

Slowest calls
■ Bash  cargo test -p core          41.0s · Review loader
■ Bash  cargo build                 14.0s · Review loader
■ Bash  npm test                     9.6s · Plan the rebrand
4 in parallel now   86% of tool time in bash   1 error
```

## What it shows

- **A lane per loop**: the main session first, then each subagent in start order, nested under the agent that started it.
- **Each tool call as a bar** as long as it took, coloured by kind: read/search, bash, edit/write, web, starting an agent, MCP. A failed call is red; the one still running pulses at the right edge.
- **A thin line where a loop was busy between calls**: the model thinking, or waiting on a subagent.
- **Quiet agents**: a running agent that has gone a minute without a tool call gets an amber stretch and "no tool call for 1:31" on its lane.
- **Finished agents** keep their lane, marked done, failed or stopped, until they leave the window.
- **Slowest calls** in the window, with which agent ran them; then how many loops are busy right now, where the tool time went, and how many calls failed.

Pick the window at the top: 30 seconds, 2 minutes, 10 minutes, or the whole session.

On the terminal, where there is no chart, each lane is a line with its call count.

## Install

```
/plugin install trace --marketplace dimay7/camplified
```

The pane opens on its own when a session starts. If you close it, `/trace-pane` brings it back. It sits beside the [agents](../agents) pane as its own tab; the two install independently.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Check for updates | on | Once a day, looks on GitHub for a newer version of this mod and for new camplified mods, and says so in a toast. Nothing is installed automatically. |

## How it works

The mod only observes: it never blocks, changes or slows a tool call.

- `src/track.ts` records each tool call's start and end on its loop's lane, the main session's turns, and agents' names, nesting and status.
- `src/state.ts` is the only file that reads or writes that state.
- `src/chart.ts` turns lanes and a time window into the SVG and the summary: pure functions, no engine calls.
- `src/pane.tsx` draws the pane.

A lane keeps its last 400 calls, and the newest 30 finished agents keep theirs. The chart is drawn as an image, redrawn as time passes; hovering a bar does not show a tooltip.

## Develop

```bash
claude plugin validate mods/trace
claude plugin test mods/trace
```
