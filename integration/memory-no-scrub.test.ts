import { expect, test } from 'bun:test';
import { startInProcessNixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startInProcessNixie({ hasStarterRules: false });

  await nixie.waitForLogEvent('ready');

  return {
    nixie,

    // the records a purge writes, which a start over data that owes none must leave out
    readPurgeKinds: (records: readonly { readonly kind: string }[]) =>
      records
        .map((record) => record.kind)
        .filter((kind) =>
          [
            'memory.evidence_purge_started',
            'memory.evidence_purge_closed',
            'memory.evidence_purged',
            'record.forgotten',
          ].includes(kind),
        ),
    stop: async () => {
      nixie.signalStop();

      const exit = await nixie.waitForExit();

      return exit.records;
    },
  };
}

test('it writes no purge record at a start over data that owes no purge', async () => {
  const ctx = await setupTest();
  const records = await ctx.stop();

  expect(ctx.readPurgeKinds(records)).toStrictEqual([]);
});

test('it writes nothing at a second start over the same data', async () => {
  const ctx = await setupTest();

  await ctx.stop();

  const again = ctx.nixie.startAgain();

  await again.waitForLogEvent('ready');

  again.signalStop();

  const exit = await again.waitForExit();

  expect(ctx.readPurgeKinds(exit.records)).toStrictEqual([]);
});
