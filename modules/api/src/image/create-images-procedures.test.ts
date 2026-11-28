import { expect, test } from 'bun:test';
import { readImageEntry } from '@heynixie/connectors';
import {
  buildStubImageProvider,
  encodeTestImage,
  readImageID,
  seedImage,
  seedImageName,
  startTestImages,
} from '@heynixie/connectors/test-utils';
import { clientHeaderName } from '@heynixie/contract';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';
import { deriveSecretHash } from '../utils/derive-secret-hash';

async function setupTest() {
  const readOnlyToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

  const api = await startTestAPI(
    {
      ...defaultAPISettings,
      readOnlyTokenHashes: [deriveSecretHash(readOnlyToken)],
    },
    { features: ['images'] },
  );

  const laptop = await createDeviceSession(api.context, 'laptop');
  const png = await encodeTestImage({ width: 4, height: 3 }, 'png');

  const images = await startTestImages({
    log: api.context.log,
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });

  return {
    ...api,
    images,
    readOnlyToken,
    png: new Uint8Array(png),
    token: laptop.token,
    client: buildTestClient(api.url, laptop.token),
  };
}

test.each([
  ['list', {}],
  ['read', { image: 'k3x9m2p7qa' }],
  ['readBytes', { image: 'k3x9m2p7qa', size: 'full' }],
  ['forget', { clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', image: 'k3x9m2p7qa' }],
])('it refuses images.%s for a read-only token with a 403', async (procedure, input) => {
  const ctx = await setupTest();

  const response = await fetch(`${ctx.url}/rpc/images/${procedure}`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'verify',
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.readOnlyToken}`,
    },
    body: JSON.stringify({ json: input }),
  });

  expect(response.status).toBe(403);
});

test('#images.list lists the images newest first with their names, prompts and edit source', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: ctx.png,
    prompt: 'a harbour at dusk',
    createdAtMs: Date.parse('2026-11-20T18:00:00Z'),
  });

  await seedImage(ctx.context.log, {
    image: 'n8w2c5r4tz',
    source: 'draw',
    bytes: ctx.png,
    from: 'k3x9m2p7qa',
    prompt: 'the same harbour in oil paint',
    isPinned: true,
    createdAtMs: Date.parse('2026-11-20T18:04:00Z'),
  });

  await seedImageName(ctx.context.log, { image: 'n8w2c5r4tz', name: 'harbour at dusk' });

  const page = await ctx.client.images.list({});

  expect(page).toStrictEqual({
    images: [
      {
        image: 'n8w2c5r4tz',
        name: 'harbour at dusk',
        prompt: 'the same harbour in oil paint',
        from: 'k3x9m2p7qa',
        source: 'draw',
        isPinned: true,
        isForgotten: false,
        createdAt: new Date('2026-11-20T18:04:00Z'),
      },
      {
        image: 'k3x9m2p7qa',
        name: null,
        prompt: 'a harbour at dusk',
        from: null,
        source: 'draw',
        isPinned: false,
        isForgotten: false,
        createdAt: new Date('2026-11-20T18:00:00Z'),
      },
    ],
    nextCursor: null,
  });
});

test('#images.list with pinnedOnly lists only the pinned images', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });

  await seedImage(ctx.context.log, {
    image: 'n8w2c5r4tz',
    source: 'draw',
    bytes: ctx.png,
    isPinned: true,
  });

  const page = await ctx.client.images.list({ pinnedOnly: true });

  expect(page.images.map((image) => image.image)).toStrictEqual(['n8w2c5r4tz']);
});

test('#images.list reads 30 images a page and continues from the cursor', async () => {
  const ctx = await setupTest();

  for (let index = 0; index < 32; index += 1) {
    await seedImage(ctx.context.log, {
      image: `img${String(index).padStart(2, '0')}`,
      source: 'draw',
      bytes: ctx.png,
    });
  }

  const first = await ctx.client.images.list({});
  const second = await ctx.client.images.list({ cursor: first.nextCursor ?? '' });

  expect({
    first: [first.images.length, first.images[0]?.image, first.images.at(-1)?.image],
    hasCursor: first.nextCursor !== null,
    second: second.images.map((image) => image.image),
    secondCursor: second.nextCursor,
  }).toStrictEqual({
    first: [30, 'img31', 'img02'],
    hasCursor: true,
    second: ['img01', 'img00'],
    secondCursor: null,
  });
});

test('#images.list leaves out a forgotten image', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });
  await seedImage(ctx.context.log, { image: 'n8w2c5r4tz', source: 'draw', bytes: ctx.png });

  await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'n8w2c5r4tz',
  });

  const page = await ctx.client.images.list({});

  expect(page.images.map((image) => image.image)).toStrictEqual(['k3x9m2p7qa']);
});

test('#images.read answers UNKNOWN_IMAGE for an ID that names no image', async () => {
  const ctx = await setupTest();

  expect(ctx.client.images.read({ image: 'nosuchimage' })).rejects.toMatchObject({
    code: 'UNKNOWN_IMAGE',
  });
});

test('#images.read returns a forgotten image with its edit source and no prompt or name', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'earlier001', source: 'draw', bytes: ctx.png });

  await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: ctx.png,
    from: 'earlier001',
    prompt: 'a harbour at dusk',
    createdAtMs: Date.parse('2026-11-20T18:00:00Z'),
  });

  await seedImageName(ctx.context.log, { image: 'k3x9m2p7qa', name: 'harbour at dusk' });

  await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  const image = await ctx.client.images.read({ image: 'k3x9m2p7qa' });

  expect(image).toStrictEqual({
    image: 'k3x9m2p7qa',
    name: null,
    prompt: null,
    from: 'earlier001',
    source: 'draw',
    isPinned: false,
    isForgotten: true,
    createdAt: new Date('2026-11-20T18:00:00Z'),
  });
});

test('#images.readBytes serves the stored PNG for the full size', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });

  const file = await ctx.client.images.readBytes({ image: 'k3x9m2p7qa', size: 'full' });
  const buffer = await file.arrayBuffer();

  const bytes = new Uint8Array(buffer);

  expect({ type: file.type, bytes }).toStrictEqual({
    type: 'image/png',
    bytes: ctx.png,
  });
});

test('#images.readBytes serves a WebP thumbnail with a long edge of at most 512 pixels', async () => {
  const ctx = await setupTest();
  const wide = await encodeTestImage({ width: 1200, height: 600 }, 'png');

  await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: new Uint8Array(wide),
  });

  const file = await ctx.client.images.readBytes({ image: 'k3x9m2p7qa', size: 'thumbnail' });
  const buffer = await file.arrayBuffer();

  const thumbnail = new Uint8Array(buffer);

  const metadata = await new Bun.Image(thumbnail).metadata();

  expect({ type: file.type, width: metadata.width, height: metadata.height }).toStrictEqual({
    type: 'image/webp',
    width: 512,
    height: 256,
  });
});

test('#images.readBytes answers UNKNOWN_IMAGE for an ID that names no image', async () => {
  const ctx = await setupTest();

  expect(ctx.client.images.readBytes({ image: 'nosuchimage', size: 'full' })).rejects.toMatchObject(
    {
      code: 'UNKNOWN_IMAGE',
    },
  );
});

test.each(['thumbnail', 'full'] as const)(
  '#images.readBytes answers IMAGE_FORGOTTEN for the %s of a forgotten image',
  async (size) => {
    const ctx = await setupTest();

    await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });

    await ctx.client.images.forget({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      image: 'k3x9m2p7qa',
    });

    expect(ctx.client.images.readBytes({ image: 'k3x9m2p7qa', size })).rejects.toMatchObject({
      code: 'IMAGE_FORGOTTEN',
    });
  },
);

test('#images.forget leaves no prompt, name or picture readable to the client or the assistant', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  await ctx.images.read('image.name', { image, name: 'harbour' });
  await ctx.images.read('image.name', { image, name: 'harbour at dusk' });
  await ctx.images.read('image.list', {});
  await ctx.images.read('image.read', { image });

  const forgotten = await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image,
  });

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result', 'image.named'],
    limit: 100,
  });

  const entry = await readImageEntry(ctx.context.log, image);
  const read = await ctx.client.images.read({ image });
  const listed = await ctx.images.read('image.list', {});

  expect({
    forgottenAt: forgotten.forgottenAt,
    backup: forgotten.backup,
    rememberedWords: entries
      .flatMap((found) =>
        found.record.erasable.status === 'readable'
          ? [JSON.stringify(found.record.erasable.fields)]
          : [],
      )
      .join(' ')
      .match(/harbour|dusk/gu),
    image: read,
    assistantEntry: entry.kind,
    assistantList: listed['images'],
  }).toStrictEqual({
    forgottenAt: expect.toBeValidDate(),
    backup: { state: 'pending' },
    rememberedWords: null,
    image: expect.objectContaining({ name: null, prompt: null, isForgotten: true }),
    assistantEntry: 'forgotten',
    assistantList: [expect.objectContaining({ name: null, prompt: null, isForgotten: true })],
  });
});

test('#images.forget keeps the picture of an edit made from the forgotten image', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });

  await seedImage(ctx.context.log, {
    image: 'n8w2c5r4tz',
    source: 'draw',
    bytes: ctx.png,
    from: 'k3x9m2p7qa',
    prompt: 'the same harbour in oil paint',
  });

  await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  const edit = await ctx.client.images.read({ image: 'n8w2c5r4tz' });

  expect(edit).toMatchObject({
    from: 'k3x9m2p7qa',
    prompt: 'the same harbour in oil paint',
    isForgotten: false,
  });
});

test('#images.forget finishes the cleanup of a retry with the same client action ID', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  await ctx.images.read('image.name', { image, name: 'harbour' });
  await ctx.images.read('image.list', {});

  let isFailing = true;

  ctx.setSessionCleanup(() => {
    if (isFailing) {
      isFailing = false;

      return Promise.reject(new Error('the session rebuild failed'));
    }

    return Promise.resolve();
  });

  const input = { clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', image };

  await ctx.client.images.forget(input).catch(() => null);

  const kinds = ['tool_called', 'tool_result', 'image.named'] as const;

  const after = await readRecords(ctx.context.log, { afterSequence: 0, kinds, limit: 100 });
  const retry = await ctx.client.images.forget(input);
  const finished = await readRecords(ctx.context.log, { afterSequence: 0, kinds, limit: 100 });

  const forgotten = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['erasure.finished'],
    limit: 100,
  });

  expect({
    leftReadable: after.some((found) => found.record.erasable.status === 'readable'),
    retried: retry.forgottenAt,
    rememberedWords: finished
      .flatMap((found) =>
        found.record.erasable.status === 'readable'
          ? [JSON.stringify(found.record.erasable.fields)]
          : [],
      )
      .join(' ')
      .match(/harbour|dusk/gu),
    forgotten: forgotten
      .filter((found) => found.record.payload['kind'] === 'record')
      .map((found) => Number(found.record.payload['targetID']))
      .toSorted((left, right) => left - right),
  }).toStrictEqual({
    leftReadable: true,
    retried: expect.toBeValidDate(),
    rememberedWords: null,
    forgotten: finished
      .filter((found) => found.record.erasable.status === 'shredded')
      .map((found) => found.record.sequence)
      .toSorted((left, right) => left - right),
  });
});

test('#images.forget answers the same time to a retry with the same client action ID', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });

  const first = await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  ctx.clock.advance(60_000);

  const retry = await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  expect(retry.forgottenAt).toStrictEqual(first.forgottenAt);
});

test('#images.forget keeps a name from being written while its cleanup is unfinished', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  ctx.setSessionCleanup(() => Promise.reject(new Error('the session rebuild failed')));

  await ctx.client.images
    .forget({ clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', image })
    .catch(() => null);

  const renamed = await ctx.images.read('image.name', { image, name: 'ink study' });

  expect(renamed).toMatchObject({ refused: { code: 'IMAGE_FORGOTTEN' } });
});

test('#images.forget leaves no rename or list made while its cleanup was unfinished readable after a retry', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  await ctx.images.read('image.name', { image, name: 'ferry portrait' });

  let isFailing = true;

  ctx.setSessionCleanup(() => {
    if (isFailing) {
      isFailing = false;

      return Promise.reject(new Error('the session rebuild failed'));
    }

    return Promise.resolve();
  });

  const input = { clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', image };

  await ctx.client.images.forget(input).catch(() => null);

  const renamed = await ctx.images.read('image.name', { image, name: 'quay at noon' });

  await ctx.images.read('image.list', {});
  await ctx.client.images.forget(input);

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result', 'image.named'],
    limit: 100,
  });

  const listed = await ctx.images.read('image.list', {});

  expect({
    renamed,
    listed: listed['images'],
    rememberedWords: entries
      .flatMap((found) =>
        found.record.erasable.status === 'readable'
          ? [JSON.stringify(found.record.erasable.fields)]
          : [],
      )
      .join(' ')
      .match(/harbour|dusk|ferry|quay|noon/gu),
  }).toStrictEqual({
    renamed: expect.objectContaining({
      refused: { code: 'IMAGE_FORGOTTEN', message: expect.any(String) },
    }),
    listed: [expect.objectContaining({ name: null, isForgotten: true })],
    rememberedWords: null,
  });
});

test('#images.forget leaves no rename by short ID or UUID made during its cleanup readable', async () => {
  const ctx = await setupTest();

  const seeded = await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: ctx.png,
    prompt: 'a harbour at dusk',
  });

  let isPaused = true;

  ctx.setSessionCleanup(async () => {
    if (isPaused) {
      isPaused = false;

      await ctx.images.read('image.name', { image: 'k3x9m2p7qa', name: 'ferry portrait' });
      await ctx.images.read('image.name', { image: seeded.uuid, name: 'quay at noon' });
    }
  });

  await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result'],
    limit: 100,
  });

  expect(
    entries
      .flatMap((found) =>
        found.record.erasable.status === 'readable'
          ? [JSON.stringify(found.record.erasable.fields)]
          : [],
      )
      .join(' '),
  ).not.toMatch(/harbour|ferry|quay/u);
});

test('#images.forget leaves no rename by short ID or UUID readable after a retry', async () => {
  const ctx = await setupTest();

  const seeded = await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: ctx.png,
    prompt: 'a harbour at dusk',
  });

  let isFailing = true;

  ctx.setSessionCleanup(() => {
    if (isFailing) {
      isFailing = false;

      return Promise.reject(new Error('the session rebuild failed'));
    }

    return Promise.resolve();
  });

  const input = { clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', image: 'k3x9m2p7qa' };

  await ctx.client.images.forget(input).catch(() => null);
  await ctx.images.read('image.name', { image: 'k3x9m2p7qa', name: 'ferry portrait' });
  await ctx.images.read('image.name', { image: seeded.uuid, name: 'quay at noon' });
  await ctx.client.images.forget(input);

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result'],
    limit: 100,
  });

  expect(
    entries
      .flatMap((found) =>
        found.record.erasable.status === 'readable'
          ? [JSON.stringify(found.record.erasable.fields)]
          : [],
      )
      .join(' '),
  ).not.toMatch(/harbour|ferry|quay/u);
});

test('#images.forget leaves no rename readable whose refusal is not written yet', async () => {
  const ctx = await setupTest();

  const seeded = await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: ctx.png,
    prompt: 'a harbour at dusk',
  });

  await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-1', runID: 'conversation', toolUseID: null, tool: 'image.name' },
      erasable: { input: { image: 'k3x9m2p7qa', name: 'ferry portrait' } },
    },
    {
      kind: 'tool_called',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-2', runID: 'conversation', toolUseID: null, tool: 'image.name' },
      erasable: { input: { image: seeded.uuid, name: 'quay at noon' } },
    },
  ]);

  await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result'],
    limit: 100,
  });

  expect(
    entries
      .flatMap((found) =>
        found.record.erasable.status === 'readable'
          ? [JSON.stringify(found.record.erasable.fields)]
          : [],
      )
      .join(' '),
  ).not.toMatch(/harbour|ferry|quay/u);
});

test('#images.forget rebuilds the session of a list result whose key went before a failed rebuild, on a retry', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.images.read('image.draw', { prompt: 'a harbour at dusk' });

  const image = readImageID(drawn);

  await ctx.images.read('image.list', {});

  const [listResult] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    order: 'newest',
    limit: 1,
  });

  const listSequence = listResult?.record.sequence;
  const rebuilt: number[] = [];
  let isFailing = true;

  ctx.setSessionCleanup((cause) => {
    if (isFailing && cause.recordSequence === listSequence) {
      isFailing = false;

      return Promise.reject(new Error('the session rebuild failed'));
    }

    rebuilt.push(cause.recordSequence);

    return Promise.resolve();
  });

  const input = { clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', image };

  await ctx.client.images.forget(input).catch(() => null);
  await ctx.client.images.forget(input);

  const forgotten = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['erasure.finished'],
    limit: 100,
  });

  expect({
    rebuilt,
    forgotten: forgotten
      .filter((found) => found.record.payload['kind'] === 'record')
      .map((found) => Number(found.record.payload['targetID'])),
  }).toStrictEqual({
    rebuilt: expect.arrayContaining([listSequence]),
    forgotten: expect.arrayContaining([listSequence]),
  });
});

test('#images.forget answers the time of the first forget for an image that is already forgotten', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });

  const first = await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  ctx.clock.advance(60_000);

  const again = await ctx.client.images.forget({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    image: 'k3x9m2p7qa',
  });

  expect(again.forgottenAt).toStrictEqual(first.forgottenAt);
});

test('#images.forget answers CLIENT_ACTION_ID_REUSED when the ID belongs to another image', async () => {
  const ctx = await setupTest();

  await seedImage(ctx.context.log, { image: 'k3x9m2p7qa', source: 'draw', bytes: ctx.png });
  await seedImage(ctx.context.log, { image: 'n8w2c5r4tz', source: 'draw', bytes: ctx.png });

  await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  expect(
    ctx.client.images.forget({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      image: 'n8w2c5r4tz',
    }),
  ).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#images.forget answers UNKNOWN_IMAGE for an ID that names no image', async () => {
  const ctx = await setupTest();

  expect(
    ctx.client.images.forget({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      image: 'nosuchimage',
    }),
  ).rejects.toMatchObject({ code: 'UNKNOWN_IMAGE' });
});

test.each(['list', 'read', 'readBytes', 'forget'] as const)(
  'it answers FEATURE_OFF to images.%s when images are off',
  async (procedure) => {
    const api = await startTestAPI();
    const owner = await createDeviceSession(api.context, 'laptop');

    const client = buildTestClient(api.url, owner.token, 'https://nixie.example.org');

    const answers = {
      list: () => client.images.list({}),
      read: () => client.images.read({ image: 'a1b2c3d4e5' }),
      readBytes: () => client.images.readBytes({ image: 'a1b2c3d4e5', size: 'full' }),
      forget: () =>
        client.images.forget({ image: 'a1b2c3d4e5', clientActionID: crypto.randomUUID() }),
    };

    const answer = answers[procedure]();

    await Promise.allSettled([answer]);

    expect(answer).rejects.toMatchObject({ code: 'FEATURE_OFF', data: { feature: 'images' } });
  },
);
