import { expect, test } from 'bun:test';
import { startInProcessNixie } from '@heynixie/server/test-utils';

test('it writes the restart end of a hold that was open when nixie stopped, as the server starts', async () => {
  const nixie = await startInProcessNixie({
    beforeStart: async (_files, seed) => {
      await seed.openTakeover();
    },
  });

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  const exit = await nixie.waitForExit();

  expect(
    exit.records
      .filter((record) => record.kind.startsWith('computer.takeover_'))
      .map((record) => [record.kind, record.payload['by']]),
  ).toStrictEqual([
    ['computer.takeover_started', undefined],
    ['computer.takeover_ended', 'restart'],
  ]);
});
