import { nixieSchema } from '@heynixie/db';
import {
  readReleaseStartOutcome,
  readTestBundle,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';
import type { RollbackCheckResult } from './pick-rollback-result';
import { isDatabaseReady, pickRollbackResult } from './pick-rollback-result';

export type { RollbackCheckResult } from './pick-rollback-result';

interface RollbackCheckOptions {
  // The release to start on the data this build wrote: its v* tag and its bundle's entry file
  readonly previous: { readonly tag: string; readonly entry: string };

  // Leaves the build under check running while the previous release starts, which only a test of
  // the fail path wants
  readonly keepBuildRunning?: boolean;
}

const waitMs = 10_000;

// Starts the build under check on a fresh data directory, stops it, and starts the previous
// release on that data directory and config. It takes no step between the 2 starts.
export async function runRollbackCheck(
  options: RollbackCheckOptions,
): Promise<RollbackCheckResult> {
  const bundle = await readTestBundle(false);
  const nixie = await startSpawnedNixie({ release: bundle.entry });

  const current = nixie.harness.start();

  const started = await readReleaseStartOutcome(current, { timeoutMs: waitMs });

  if (started.outcome !== 'started') {
    throw new Error(`the build under check did not start: ${JSON.stringify(started)}`);
  }

  if (!isDatabaseReady(started.readyBody)) {
    throw new Error(`the build under check did not report its database ready:\n${started.output}`);
  }

  if (options.keepBuildRunning !== true) {
    current.signal('SIGTERM');

    const exit = await current.exited;

    if (exit.code !== 0 || exit.signal !== null) {
      throw new Error(
        `the build under check did not stop cleanly: ${JSON.stringify(exit)}\n${current.readOutput()}`,
      );
    }
  }

  const outcome = await readReleaseStartOutcome(
    nixie.harness.startRelease(options.previous.entry),
    {
      timeoutMs: waitMs,
    },
  );

  return pickRollbackResult(options.previous.tag, outcome, nixieSchema.oldestReader);
}
