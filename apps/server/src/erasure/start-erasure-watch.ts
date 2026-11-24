import { startSweep } from '@heynixie/clock';
import type { ErasureRunnerControl } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { ServerParts } from '../types';
import { runErasureWatchPass } from './run-erasure-watch-pass';

const retryMs = 30_000;

// Every 30 seconds, runs again each erasure that is open past the config's stuck threshold, and
// alerts on one that stays open.
export async function startErasureWatch(
  parts: ServerParts,
  runner: ErasureRunnerControl,
): Promise<void> {
  const sweep = startSweep({
    clock: parts.context.clock,
    intervalMs: retryMs,
    run: () =>
      runErasureWatchPass({
        runner,
        log: parts.log,
        nowMs: () => parts.context.clock.now(),
        stuckAfterMs: parts.config.erasure.stuckAfterMs,
      }),
    onError: (error) => {
      parts.log('erasure.watch_failed', toErrorFields(error), 'warn');
    },
  });

  await parts.cleanup.defer(() => sweep.stop());
}
