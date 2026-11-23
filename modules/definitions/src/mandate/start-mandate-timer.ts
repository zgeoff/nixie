import type { Clock, Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';
import type { RuleContext } from '../runtime/write-runtime-rule';
import { runMandateExpiry } from './run-mandate-expiry';

const timerMs = 30_000;

export interface MandateTimerOptions {
  readonly context: RuleContext;
  readonly clock: Clock;
  readonly onError: (error: unknown) => void;
}

// Each mandate ends within a minute of its end, whatever the interval.
export function startMandateTimer(options: MandateTimerOptions): Sweep {
  return startSweep({
    clock: options.clock,
    intervalMs: timerMs,
    run: () => runMandateExpiry(options.context),
    onError: options.onError,
  });
}
