import type { ErasureStuckPort, StuckForget } from '@heynixie/api';
import type { ErasureRunnerControl, StuckErasure } from '@heynixie/log';

export interface ErasureStuckPortOptions {
  readonly nowMs: () => number;
  readonly stuckAfterMs: number;
}

// The owner's screen and the model's tools read and retry stuck forgets through this port, so each
// asks the runner for the config's threshold and neither sees a forget's own ID.
export function buildErasureStuckPort(
  runner: Pick<ErasureRunnerControl, 'readStuck' | 'retryStuck'>,
  options: ErasureStuckPortOptions,
): ErasureStuckPort {
  const query = () => ({ nowMs: options.nowMs(), stuckAfterMs: options.stuckAfterMs });

  return {
    readStuck: async () => {
      const stuck = await runner.readStuck(query());

      return stuck.map((erasure) => toStuckForget(erasure));
    },
    retryStuck: async () => {
      const retry = await runner.retryStuck(query());

      return retry.stillOpen.map((erasure) => toStuckForget(erasure));
    },
  };
}

function toStuckForget(erasure: StuckErasure): StuckForget {
  return { kind: erasure.kind, shortID: erasure.shortID, openForMs: erasure.openForMs };
}
