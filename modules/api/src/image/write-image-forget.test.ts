import { expect, test } from 'bun:test';
import { readImageEntry, readImageForgetTargets } from '@heynixie/connectors';
import {
  buildStubImageProvider,
  readImageID,
  startTestImages,
} from '@heynixie/connectors/test-utils';
import type { ErasureFaultPoint } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import { recordForgetStartedCodec, recordForgottenCodec } from '@heynixie/memory';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { buildTestErasureRunner } from '../test-utils/build-test-erasure-runner';
import { createDeviceSession } from '../test-utils/create-device-session';
import { registerTestRecordForgets } from '../test-utils/register-test-record-forgets';
import { startTestAPI } from '../test-utils/start-test-api';
import { buildInputHash } from '../utils/build-input-hash';
import { writeClientAction } from '../utils/write-client-action';
import { writeImageForget } from './write-image-forget';

async function setupTest() {
  const api = await startTestAPI(undefined, { features: ['images'] });
  const laptop = await createDeviceSession(api.context, 'laptop');

  const images = await startTestImages({
    log: api.context.log,
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });

  return {
    ...api,
    images,
    laptop,
    client: buildTestClient(api.url, laptop.token),
    restartRunner: () => {
      const restarted = buildTestErasureRunner(api.context.log);

      registerTestRecordForgets(api.context, restarted);

      return restarted;
    },
    readKinds: async () => {
      const entries = await readRecords(api.context.log, { afterSequence: 0, limit: 200 });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it writes erasure.started and erasure.finished for an image, and no record of the old kinds', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: readImageID(drawn),
  });

  const kinds = await ctx.readKinds();

  expect(kinds.filter((kind) => kind.startsWith('record.'))).toStrictEqual([]);

  const erasures = kinds.filter((kind) => kind.startsWith('erasure.'));

  expect({
    first: erasures.at(0),
    last: erasures.at(-1),
    startedCount: erasures.filter((kind) => kind === 'erasure.started').length,
    finishedCount: erasures.filter((kind) => kind === 'erasure.finished').length,
  }).toStrictEqual({
    first: 'erasure.started',
    last: 'erasure.finished',
    startedCount: 3,
    finishedCount: 3,
  });
});

test.each<ErasureFaultPoint>([
  'erasure.begun',
  'erasure.revoked',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
])(
  'it finishes at the next start the forget of an image that a crash at %s cut short',
  async (point) => {
    const ctx = await setupTest();
    const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

    const image = readImageID(drawn);

    ctx.effects.crashAt(point);

    const failed = ctx.client.images.forget({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      image,
    });

    await Promise.allSettled([failed]);

    expect(failed).rejects.toThrow();

    await ctx.restartRunner().finishOpen();

    const entry = await readImageEntry(ctx.context.log, image);
    const kinds = await ctx.readKinds();

    expect({
      entry: entry.kind,
      started: kinds.filter((kind) => kind === 'erasure.started').length,
      finished: kinds.filter((kind) => kind === 'erasure.finished').length,
    }).toStrictEqual({ entry: 'forgotten', started: 3, finished: 3 });
  },
);

test('it hides an image from the gallery and the image reader once its forget has begun', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  ctx.effects.crashAt('erasure.begun');

  const failed = ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image,
  });

  await Promise.allSettled([failed]);

  expect(failed).rejects.toThrow();

  const page = await ctx.client.images.list({});
  const entry = await readImageEntry(ctx.context.log, image);

  expect({ listed: page.images.length, entry: entry.kind }).toStrictEqual({
    listed: 0,
    entry: 'forgotten',
  });
});

test('it answers a repeat forget of a forgotten image with the sequence of the first finish', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  const first = await writeImageForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image,
  });

  const repeat = await writeImageForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    image,
  });

  expect(first).toStrictEqual({
    status: 'forgotten',
    forgottenAt: expect.toBeNumber(),
    progress: { stage: 'forgotten', sequence: expect.toBeNumber() },
  });

  expect(repeat).toStrictEqual(first);
});

test('it answers a retry of a forget that an earlier release finished with the time and the backup progress that it kept', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  const found = await readImageForgetTargets(ctx.context.log, image);

  invariant(found);

  const written = await writeRecords(
    ctx.context.log,
    found.targets.flatMap((target) => [
      {
        kind: recordForgetStartedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        thread: target.thread,
        payload: recordForgetStartedCodec.encode({ recordSequence: target.sequence }),
      },
      {
        kind: recordForgottenCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        thread: target.thread,
        payload: recordForgottenCodec.encode({ recordSequence: target.sequence }),
      },
    ]),
  );

  const lastSequence = Math.max(...written.map((record) => record.sequence));

  await withWriteTransaction(ctx.context.log.writer, (tx) =>
    writeClientAction(tx, {
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      procedure: 'images.forget',
      identityID: ctx.laptop.caller.identityID,
      inputHash: buildInputHash({ image }),
      result: {
        forgottenAt: 1_700_000_000_000,
        targets: found.targets.map((target) => ({ sequence: target.sequence })),
      },
      recordedAt: 1_700_000_000_000,
    }),
  );

  const retried = await writeImageForget(ctx.context, ctx.laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image,
  });

  expect(retried).toStrictEqual({
    status: 'forgotten',
    forgottenAt: 1_700_000_000_000,
    progress: { stage: 'forgotten', sequence: lastSequence },
  });
});
