import type { ErasureRunnerControl } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';

export interface ErasureWatchPassOptions {
  readonly runner: Pick<ErasureRunnerControl, 'retryStuck'>;
  readonly log: Logger;
  readonly nowMs: () => number;
  readonly stuckAfterMs: number;
}

// One pass of the watch: runs again each erasure open past the stuck threshold, and alerts on each
// one still open afterwards. A younger erasure may wait on the step that called it, so it stays.
export async function runErasureWatchPass(options: ErasureWatchPassOptions): Promise<void> {
  const retry = await options.runner.retryStuck({
    nowMs: options.nowMs(),
    stuckAfterMs: options.stuckAfterMs,
  });

  for (const failure of retry.failures) {
    options.log('erasure.retry_failed', toErrorFields(failure), 'warn');
  }

  for (const erasure of retry.stillOpen) {
    options.log(
      'erasure.stuck',
      { erasureID: erasure.erasureID, kind: erasure.kind, openForMs: erasure.openForMs },
      'error',
    );
  }
}
