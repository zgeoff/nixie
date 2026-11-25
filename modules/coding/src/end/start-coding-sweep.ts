import type { Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';
import { toErrorFields } from '@heynixie/logger';
import type { CodingAdapter, CodingContext } from '../types';
import { runCodingSweep } from './run-coding-sweep';

const sweepMs = 10 * 60 * 1000;

// Runs the coding sweep when the server starts and every 10 min after.
export function startCodingSweep(context: CodingContext, adapter: CodingAdapter): Sweep {
  return startSweep({
    clock: context.tasks.clock,
    intervalMs: sweepMs,
    runOnStart: true,
    run: () => runCodingSweep(context, adapter),
    onError: (error) => {
      context.logEvent('coding.sweep_failed', { adapter: adapter.id, ...toErrorFields(error) });
    },
  });
}
