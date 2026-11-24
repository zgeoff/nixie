import type { ErasureRunnerControl, ErasureSessionCause, Log } from '@heynixie/log';
import { makeErasureRunner } from '@heynixie/log';
import { buildTestErasureEffects } from '@heynixie/log/test-utils';

// A runner whose effects touch nothing, so a route test forgets for real over the log and the
// stores. `cleanupSessions` sees each session cleanup the runner runs.
export function buildTestErasureRunner(
  log: Log,
  cleanupSessions: (cause: ErasureSessionCause) => Promise<void> = () => Promise.resolve(),
): ErasureRunnerControl {
  const fake = buildTestErasureEffects();

  return makeErasureRunner({
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    effects: { ...fake.effects, cleanupSessions },
  });
}
