import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Line } from '../types'

// This file is the only one that touches the session's stored state: the
// engine lists what a module reads and writes from atoms declared with
// literal names in the file that uses them, so the rest of the mod goes
// through the accessors below (function declarations: past an import, the
// engine follows `$` only into those).

// Change a shape tag when its value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const line = atom({ plugin: 'statusbar', key: 'line' } as const, null, { shape: 'line-1' })
const lines = atom({ plugin: 'statusbar', key: 'lines' } as const, { added: 0, removed: 0 }, { shape: 'lines-1' })
const hidden = atom({ plugin: 'statusbar', key: 'hidden' } as const, false)

type $ = EngineInterface

export function readLine($: $) {
  return read($, line)
}
export function setLine($: $, next: Line) {
  return update($, line, () => next)
}
export function readLines($: $) {
  return read($, lines)
}
export function addLines($: $, added: number, removed: number) {
  return update($, lines, n => ({ added: n.added + added, removed: n.removed + removed }))
}
export function readHidden($: $) {
  return read($, hidden)
}
export function setHidden($: $, isHidden: boolean) {
  return update($, hidden, () => isHidden)
}
