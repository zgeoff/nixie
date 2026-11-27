import { expect, test } from 'bun:test';
import { startInProcessNixie } from './start-in-process-nixie';

test('it leaves an ask open, which a nixie that starts on the data closes as expired', async () => {
  const nixie = await startInProcessNixie({
    beforeStart: async (_files, seed) => {
      await seed.openHandover();
    },
  });

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  const exit = await nixie.waitForExit();

  expect(
    exit.records
      .filter((record) => record.kind.startsWith('computer.handover_'))
      .map((record) => [record.kind, record.payload['by']]),
  ).toStrictEqual([
    ['computer.handover_asked', undefined],
    ['computer.handover_closed', 'expired'],
  ]);
});
