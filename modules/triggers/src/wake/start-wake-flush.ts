import type { Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';
import { toErrorFields } from '@heynixie/logger';
import type { TriggerCoreContext } from '../types';
import { runWakeFlush } from './run-wake-flush';

const flushIntervalMs = 20_000;

// Runs the flush every 20 seconds, so a held match wakes its target within 20 seconds of one of its
// rules becoming ready.
export function startWakeFlush(core: TriggerCoreContext): Sweep {
  return startSweep({
    clock: core.clock,
    intervalMs: flushIntervalMs,
    run: () => runWakeFlush(core),
    onError: (error) => {
      core.logEvent('trigger.wake_flush_failed', toErrorFields(error));
    },
  });
}
