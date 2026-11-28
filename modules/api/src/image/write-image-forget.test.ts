import { expect, test } from 'bun:test';
import { readImageEntry } from '@heynixie/connectors';
import {
  buildStubImageProvider,
  readImageID,
  startTestImages,
} from '@heynixie/connectors/test-utils';
import type { ErasureFaultPoint } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

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
    client: buildTestClient(api.url, laptop.token),
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

    await ctx.client.images
      .forget({ clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', image })
      .catch(() => null);

    await ctx.runner.finishOpen();

    const entry = await readImageEntry(ctx.context.log, image);
    const kinds = await ctx.readKinds();

    expect({
      entry: entry.kind,
      started: kinds.filter((kind) => kind === 'erasure.started').length,
      finished: kinds.filter((kind) => kind === 'erasure.finished').length,
    }).toStrictEqual({ entry: 'forgotten', started: 3, finished: 3 });
  },
);
