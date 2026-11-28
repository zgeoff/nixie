import type { ErasureCleanupCause, ErasureRunnerControl, Log } from '@heynixie/log';
import { makeErasureRunner } from '@heynixie/log';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';

// A runner whose effects touch nothing but the sessions: `cleanupSessions` sees each cleanup the
// runner runs, so a test forgets for real over the log and the stores.
export function buildTestErasureRunner(
  log: Log,
  cleanupSessions: (cause: ErasureCleanupCause) => Promise<void>,
): ErasureRunnerControl {
  const fake = buildTestErasureEffects();

  return makeErasureRunner({
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    effects: { ...fake.effects, cleanupSessions },
  });
}
