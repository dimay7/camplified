import type { Register } from 'claude-code'

import { band, startBand } from '../src/band'
import { startStatus, track } from '../src/run'
import { startUpdates } from '../src/updates'

// Each part hooks the events it needs: tracking marks the line stale and
// counts edited lines, the tick reruns the status line, the band draws it.
// A module takes one session.start hook, so the parts start from here.
export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await startBand($)
    startStatus($)
    if (options.checkForUpdates !== false) startUpdates($)

    return next(e)
  })

  track(on)
  band(on)
}
