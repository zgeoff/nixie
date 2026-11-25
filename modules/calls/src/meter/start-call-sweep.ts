import type { Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';
import { toErrorFields } from '@heynixie/logger';
import type { CallsContext } from '../types';
import { runCallSweep } from './run-call-sweep';

const sweepMs = 5000;

// Runs the call sweep every 5 s, so a call's minute charges within 5 s of its start.
export function startCallSweep(context: CallsContext): Sweep {
  return startSweep({
    clock: context.clock,
    intervalMs: sweepMs,
    run: () => runCallSweep(context),
    onError: (error) => {
      context.logEvent('calls.sweep_failed', toErrorFields(error));
    },
  });
}
