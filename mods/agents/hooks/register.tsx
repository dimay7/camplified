import type { Register } from 'claude-code'

import { startTracking, track } from '../src/track'
import { startUpdates } from '../src/updates'
import { pane, startPane } from '../src/view/pane'

// Each part hooks the events it needs: tracking writes state, the pane draws
// it. A module takes one session.start hook, so the parts start from here.
export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await startPane($)
    startTracking($)
    if (options.checkForUpdates !== false) startUpdates($)

    return next(e)
  })

  track(on)
  pane(on)
}
