import type { Clock } from '@heynixie/clock';
import type { ProposalLapseSweep } from '@heynixie/proposals';
import { startProposalLapseSweep } from '@heynixie/proposals';
import type { RuleContext } from '../runtime/write-runtime-rule';
import { runMandateExpiry } from './run-mandate-expiry';

const timerMs = 30_000;

export interface MandateTimerOptions {
  readonly context: RuleContext;
  readonly clock: Clock;
  readonly onError: (error: unknown) => void;
}

// Each mandate ends within a minute of its end, whatever the interval.
export function startMandateTimer(options: MandateTimerOptions): ProposalLapseSweep {
  return startProposalLapseSweep({
    sweep: () => runMandateExpiry(options.context),
    clock: options.clock,
    intervalMs: timerMs,
    onError: options.onError,
  });
}
