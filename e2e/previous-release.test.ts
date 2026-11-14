import { expect, test } from 'bun:test';
import {
  formatReleaseStartOutcome,
  readPreviousReleaseBuild,
  readReleaseStartOutcome,
  readTestBundle,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';

// The rollback check owns the expected outcome, so this test records it and asserts neither.
test('it records whether the previous release starts on a data directory this build wrote', async () => {
  const [previous, bundle] = await Promise.all([readPreviousReleaseBuild(), readTestBundle(false)]);
  const nixie = await startSpawnedNixie({ release: bundle.entry });

  const current = nixie.harness.start();

  await current.waitForLogEvent('http.listening');

  current.signal('SIGTERM');

  const exit = await current.exited;

  expect(exit).toStrictEqual({ code: 0, signal: null });

  const result = await readReleaseStartOutcome(nixie.harness.startRelease(previous.entry), {
    timeoutMs: 5000,
  });

  process.stdout.write(`${formatReleaseStartOutcome(previous.tag, result)}\n`);

  expect(['started', 'refused']).toContain(result.outcome);
});
