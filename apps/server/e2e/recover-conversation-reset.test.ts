import { expect, test } from 'bun:test';
import { createTestClient, runHostCommand, startE2ENixie } from '@heynixie/server/test-utils';

async function setupTest() {
  return { nixie: await startE2ENixie() };
}

test.each([
  'erasure.begun',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
] as const)(
  'it finishes at the next start the conversation reset that nixie was killed during at %s',
  async (point) => {
    const ctx = await setupTest();

    const killed = ctx.nixie.harness.start([{ point, kind: 'erasure' }]);

    await createTestClient(killed);

    const resetting = Promise.allSettled([
      runHostCommand(ctx.nixie.configPath, ['reset', '--only', 'conversations', '--yes']),
    ]);

    await killed.waitForArrival(point);
    await killed.kill();

    await resetting;

    const restarted = ctx.nixie.harness.start();

    await restarted.ready;

    const finished = await ctx.nixie.waitForRecord(
      (record) => record.kind === 'erasure.finished' && record.payload['kind'] === 'conversation',
    );

    const records = await ctx.nixie.readRecords();

    await restarted.kill();

    expect(finished.payload['targetID']).toBe('conversation');
    expect(records.filter((record) => record.kind === 'erasure.started')).toHaveLength(1);
  },
);
