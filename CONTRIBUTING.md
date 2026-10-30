# Contributing

Thanks for helping. This repository is a Claude Code marketplace: each folder under `mods/` is one mod that people install on its own.

## Run a mod from your checkout

Add your clone as a local marketplace once:

```bash
claude plugin marketplace add ./
claude plugin install agents@camplified
```

A mod installed from a local folder is read from that folder, so after an edit run `/reload-plugins` in a session: no reinstall, no version bump.

## Check your change

Every pull request runs these in CI; run them first:

```bash
claude plugin validate mods/<mod>
claude plugin test mods/<mod>
```

For type errors in your editor: once Claude Code has loaded the mod, it writes the API's types into `mods/<mod>/.claude-plugin/types/` (ignored by git), and the mod's `tsconfig.json` points at them.

## Add a mod

```bash
scripts/new-mod.sh <name> "<one-line description>"
```

It makes `mods/<name>/` with a manifest, a hooks module that opens an empty pane, a state contract, a test and a README, and lists the mod in `.claude-plugin/marketplace.json`. Then:

1. Build it. A mod is one hooks module (`hooks/register.tsx`) plus the files it imports; see `mods/agents` for one split into tracking, state and views.
2. Add a line for it to the table in the top-level `README.md`.
3. Add a `## <name>` section to `CHANGELOG.md`.

A few rules the engine enforces, worth knowing up front:

- One `session.start` hook per module (without a matcher): start every part from it.
- State is read and written only in the file that declares its atoms, with literal names (`atom({ plugin: 'agents', key: 'runs' })`). Give other files function accessors.
- `$` is passed only to function declarations across files, never stored in an object.
- A hook on `tool.call` or `agent.spawn` should only observe: swallow its own errors and always return what `next(e)` returned.

## Releasing a change to a mod

People get a new version only when its number changes:

1. Bump `version` in `mods/<mod>/.claude-plugin/plugin.json` (0.1.0 → 0.1.1 for a fix, 0.2.0 for a feature).
2. Add what changed under that version in `CHANGELOG.md`.

Within a day, installed copies show a toast pointing at `claude plugin update <mod>@camplified`.

## Pull requests

- One mod, or one concern, per pull request.
- Keep the mod observing: a mod that blocks, rewrites or slows what Claude Code does needs a strong reason and a setting to turn it off.
- No network calls beyond the update check without discussing it in an issue first.
