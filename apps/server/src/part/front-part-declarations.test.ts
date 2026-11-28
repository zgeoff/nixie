import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import invariant from 'tiny-invariant';
import { createTestClient } from '../test-utils/create-test-client';
import { readSurvivingKeyIDs } from '../test-utils/read-surviving-key-ids';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';
import type { BootFiles } from '../test-utils/write-boot-files';

async function setupTest() {
  const seeded: {
    files: BootFiles | null;
    call: { readonly sequence: number; readonly keyID: string } | null;
  } = { files: null, call: null };

  const nixie = await startInProcessNixie({
    isCodeOff: true,
    beforeStart: async (files, seed) => {
      seeded.files = files;

      seeded.call = await seed.codeCall('conversation', 'call-plum-4');
    },
  });

  const api = await createTestClient(nixie);

  const sandbox = await nixie.guest.adapter.create(
    buildMockSandboxSpec({ kind: 'code_run', toolRoute: false, owner: 'code_run:call-plum-4' }),
  );

  const files = seeded.files;
  const call = seeded.call;

  invariant(files !== null && call !== null, 'the call was seeded before the start');

  return {
    nixie,
    api,
    sandbox,
    call,
    readSurvivingKeyIDs: () => readSurvivingKeyIDs(files, [call.keyID]),
  };
}

test('it destroys the code sandbox of a forgotten call, then erases its key and forgets the record, while the code tool is off', async () => {
  const ctx = await setupTest();

  await ctx.api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    thread: 'conversation',
    sequence: ctx.call.sequence,
  });

  ctx.nixie.signalStop();

  const exit = await ctx.nixie.waitForExit();

  expect({
    isSandboxKept: ctx.nixie.guest.readSandboxIDs().includes(ctx.sandbox.id),
    forgotten: exit.records
      .filter((record) => record.kind === 'erasure.finished' && record.payload['kind'] === 'record')
      .map((record) => Number(record.payload['targetID'])),
    survivingKeyIDs: await ctx.readSurvivingKeyIDs(),
  }).toStrictEqual({ isSandboxKept: false, forgotten: [ctx.call.sequence], survivingKeyIDs: [] });
});

test('it keeps the key and the record when the code sandbox will not go, so the forget runs again', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.failNextDestroy('code_run:call-plum-4', 'the sandbox host refused');

  const forgotten = ctx.api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    thread: 'conversation',
    sequence: ctx.call.sequence,
  });

  await forgotten.catch(() => {});

  expect(forgotten).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });

  ctx.nixie.signalStop();

  const exit = await ctx.nixie.waitForExit();

  expect({
    forgotten: exit.records.filter((record) => record.kind === 'erasure.finished'),
    survivingKeyIDs: await ctx.readSurvivingKeyIDs(),
  }).toStrictEqual({ forgotten: [], survivingKeyIDs: [ctx.call.keyID] });
});
