import { expect, test } from 'bun:test';
import {
  readPreviousReleaseBuild,
  readTestBundle,
  seedMemoryItems,
} from '@heynixie/server/test-utils';
import { runRollbackCheck } from './src/test-utils/run-rollback-check';

test('it starts the previous release on the data this build wrote', async () => {
  const previous = await readPreviousReleaseBuild();
  const result = await runRollbackCheck({ previous });

  process.stdout.write(`rollback check against ${previous.tag}: ${JSON.stringify(result)}\n`);

  expect(result).not.toMatchObject({ verdict: 'fail' });
});

test('it passes when the release that starts is this build', async () => {
  const bundle = await readTestBundle(false);
  const result = await runRollbackCheck({ previous: { tag: 'this build', entry: bundle.entry } });

  expect(result).toStrictEqual({ verdict: 'pass', previous: 'this build' });
});

test('it fails with the refusal when the release cannot take the writer lock', async () => {
  const bundle = await readTestBundle(false);

  const result = await runRollbackCheck({
    previous: { tag: 'this build', entry: bundle.entry },
    keepBuildRunning: true,
  });

  expect(result).toStrictEqual({
    verdict: 'fail',
    previous: 'this build',
    output: expect.stringContaining('writer lock held by another process'),
  });
});

test('it starts the previous release on data that holds memory items with 2 versions, labels and proposals', async () => {
  const previous = await readPreviousReleaseBuild();
  const result = await runRollbackCheck({ previous, seed: seedMemoryItems });

  expect(result).not.toMatchObject({ verdict: 'fail' });
});
