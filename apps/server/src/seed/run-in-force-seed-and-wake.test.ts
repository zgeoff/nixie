import { expect, mock, test } from 'bun:test';
import { runInForceSeedAndWake } from './run-in-force-seed-and-wake';

test('it wakes the export of the skills nixie wrote, before the server parts start', async () => {
  const wake = mock(() => {});

  await runInForceSeedAndWake(null, { wake, stop: () => Promise.resolve() });

  expect(wake).toHaveBeenCalledOnce();
});

test('it runs with no export when the configuration names no definitions repo', async () => {
  await expect(runInForceSeedAndWake(null, null)).toResolve();
});
