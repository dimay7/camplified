#!/usr/bin/env bash
# Scaffolds mods/<name>: a manifest, a hooks module that opens an empty pane,
# a state contract, a test and a README; then lists it in the marketplace.
#
#   scripts/new-mod.sh <name> "<one-line description>"
set -euo pipefail

name="${1:-}"
description="${2:-}"
if [[ ! "$name" =~ ^[a-z][a-z0-9-]*$ || -z "$description" ]]; then
  echo "usage: scripts/new-mod.sh <name> \"<one-line description>\"" >&2
  echo "       <name>: lowercase letters, digits and dashes, starting with a letter" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/mods/$name"
if [[ -e "$dir" ]]; then
  echo "mods/$name already exists" >&2
  exit 1
fi

mkdir -p "$dir/.claude-plugin" "$dir/hooks" "$dir/src" "$dir/types" "$dir/tests"

cat >"$dir/.claude-plugin/plugin.json" <<EOF
{
  "name": "$name",
  "version": "0.1.0",
  "description": "$description",
  "author": { "name": "dimay7", "url": "https://github.com/dimay7" },
  "homepage": "https://github.com/dimay7/camplified/tree/main/mods/$name",
  "repository": "https://github.com/dimay7/camplified",
  "license": "MIT",
  "types": "./types/index.d.ts"
}
EOF

echo '{ "modules": ["./register.tsx"] }' >"$dir/hooks/hooks.json"
echo '{ "extends": "./.claude-plugin/types/tsconfig.json" }' >"$dir/tsconfig.json"

cat >"$dir/hooks/register.tsx" <<EOF
import type { Register } from 'claude-code'

import { pane, startPane } from '../src/pane'

export const register: Register = on => {
  on('session.start', async (\$, e, next) => {
    await startPane(\$)

    return next(e)
  })

  pane(on)
}
EOF

cat >"$dir/src/pane.tsx" <<EOF
import type { EngineInterface, On } from 'claude-code'

/** Opens the pane once the session is ready. */
export async function startPane(\$: EngineInterface) {
  void \$.ui.open({ id: '$name', title: '$name' })
}

/** Draws the pane. Names in matchers are literals: the engine reads them off the source. */
export function pane(on: On) {
  on('ui.render', { component: 'Pane', requestId: '$name' }, async (\$, e) => {
    const { Text } = \$.ui.resolve(e)

    return <Text dimColor>Nothing here yet.</Text>
  })
}
EOF

cat >"$dir/types/index.d.ts" <<EOF
// The values this mod keeps in \$.state, by key: add each atom's type here
// as the mod gains state (see mods/agents/types for a filled-in one).
export type State = {}

declare module 'claude-code' {
  interface PluginState {
    '$name': State
  }
}
EOF

cat >"$dir/tests/$name.test.tsx" <<EOF
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: '$name',
  component: 'Pane',
  requestId: '$name',
  props: {
    title: '$name',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the pane draws, on every surface', async \$ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await \$.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('Nothing here yet.')
    await ui.unmount()
  }
})
EOF

cat >"$dir/README.md" <<EOF
# $name

$description

## Install

\`\`\`
/plugin install $name --marketplace dimay7/camplified
\`\`\`
EOF

# List it in the marketplace.
node - "$root/.claude-plugin/marketplace.json" "$name" "$description" <<'EOF'
const fs = require('fs')
const [file, name, description] = process.argv.slice(2)
const market = JSON.parse(fs.readFileSync(file, 'utf8'))
market.plugins.push({ name, source: `./mods/${name}`, description })
fs.writeFileSync(file, JSON.stringify(market, null, 2) + '\n')
EOF

echo "Made mods/$name and listed it in .claude-plugin/marketplace.json."
echo "Next: build it, add it to README.md's table and a section to CHANGELOG.md, then:"
echo "  claude plugin validate mods/$name && claude plugin test mods/$name"
