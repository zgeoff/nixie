import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import invariant from 'tiny-invariant';
import { createTestClient } from '../test-utils/create-test-client';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest() {
  const seeded: { sequence: number | null } = { sequence: null };

  const nixie = await startInProcessNixie({
    isCodeOff: true,
    beforeStart: async (_files, seed) => {
      seeded.sequence = await seed.codeCall('conversation', 'call-plum-4');
    },
  });

  const api = await createTestClient(nixie);

  const sandbox = await nixie.guest.adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false, owner: 'code_run:call-plum-4' }),
  );

  invariant(seeded.sequence !== null, 'the call was seeded before the start');

  return { nixie, api, sandbox, sequence: seeded.sequence };
}

test('it destroys the code sandbox of a forgotten call, and forgets the record, while the code tool is off', async () => {
  const ctx = await setupTest();

  await ctx.api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    thread: 'conversation',
    sequence: ctx.sequence,
  });

  ctx.nixie.signalStop();

  const exit = await ctx.nixie.waitForExit();

  expect({
    isSandboxKept: ctx.nixie.guest.readSandboxIDs().includes(ctx.sandbox.id),
    forgotten: exit.records
      .filter((record) => record.kind === 'record.forgotten')
      .map((record) => record.payload['recordSequence']),
  }).toStrictEqual({ isSandboxKept: false, forgotten: [ctx.sequence] });
});

test('it keeps the record when the code sandbox will not go, so the forget runs again', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.failNextDestroy('code_run:call-plum-4', 'the sandbox host refused');

  const forgotten = ctx.api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    thread: 'conversation',
    sequence: ctx.sequence,
  });

  await forgotten.catch(() => {});

  await expect(forgotten).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });

  ctx.nixie.signalStop();

  const exit = await ctx.nixie.waitForExit();

  expect(exit.records.filter((record) => record.kind === 'record.forgotten')).toStrictEqual([]);
});
