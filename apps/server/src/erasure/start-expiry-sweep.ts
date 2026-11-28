import { startSweep } from '@heynixie/clock';
import { toErrorFields } from '@heynixie/logger';
import { defaultExpiryBatchSize, runExpiry } from '@heynixie/memory';
import type { ServerParts } from '../types';
import type { StartedErasureRunner } from './start-erasure-runner';

const msPerHour = 3_600_000;

type ExpirySweepParts = Pick<ServerParts, 'log'> & {
  readonly context: Pick<ServerParts['context'], 'clock'>;
  readonly config: { readonly erasure: Pick<ServerParts['config']['erasure'], 'expireAfterMs'> };
  readonly cleanup: Pick<ServerParts['cleanup'], 'defer'>;
};

// At the start and then every hour, expires each tool result, connector result and helper note that
// is older than the config's expiry age.
export async function startExpirySweep(
  parts: ExpirySweepParts,
  runner: Pick<StartedErasureRunner, 'expire'>,
): Promise<void> {
  const sweep = startSweep({
    clock: parts.context.clock,
    intervalMs: msPerHour,
    runOnStart: true,
    run: async () => {
      const batches = await runExpiry(runner.expire, {
        nowMs: parts.context.clock.now(),
        expireAfterMs: parts.config.erasure.expireAfterMs,
        batchSize: defaultExpiryBatchSize,
      });

      if (batches > 0) {
        parts.log('expiry.finished', { batches }, 'info');
      }
    },
    onError: (error) => {
      parts.log('expiry.failed', toErrorFields(error), 'warn');
    },
  });

  await parts.cleanup.defer(() => sweep.stop());
}
