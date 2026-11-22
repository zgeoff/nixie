import { expect, test } from 'bun:test';
import { startInProcessNixie } from './start-in-process-nixie';

test('it leaves a take-over open, which a nixie that starts on the data ends with a restart record', async () => {
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
