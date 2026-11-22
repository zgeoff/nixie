import { nixieSchema } from '@heynixie/db';
import type { RollbackCheckResult } from './pick-rollback-result';
import { isDatabaseReady, pickRollbackResult } from './pick-rollback-result';
import { readReleaseStartOutcome } from './read-release-start-outcome';
import { readTestBundle } from './read-test-bundle';
import { startSpawnedNixie } from './start-spawned-nixie';
import type { BootFiles } from './write-boot-files';

export type { RollbackCheckResult } from './pick-rollback-result';

interface RollbackCheckOptions {
  // The release to start on the data this build wrote: its v* tag and its bundle's entry file
  readonly previous: {
    readonly tag: string;
    readonly entry: string;

    // The manifest keys the release reads, because a release refuses a key it does not know. A
    // deployment rolls back with the manifest of that release, so the check keeps only these.
    readonly imageKeys?: readonly string[];
  };

  // Leaves the build under check running while the previous release starts, which only a test of
  // the fail path wants
  readonly keepBuildRunning?: boolean;

  // Writes values into the data once the build under check has stopped, so the previous release
  // reads more than an empty database
  readonly seed?: (files: BootFiles) => Promise<unknown>;
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

  await options.seed?.(nixie);

  const outcome = await readReleaseStartOutcome(
    nixie.harness.startRelease(options.previous.entry, options.previous.imageKeys),
    {
      timeoutMs: waitMs,
    },
  );

  return pickRollbackResult(options.previous.tag, outcome, nixieSchema.oldestReader);
}
