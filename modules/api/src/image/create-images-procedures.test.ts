import { expect, test } from 'bun:test';
import { readImageEntry } from '@heynixie/connectors';
import { encodeTestImage, seedImage, seedImageName } from '@heynixie/connectors/test-utils';
import { clientHeaderName } from '@heynixie/contract';
import { readRecords } from '@heynixie/log';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';
import { deriveSecretHash } from '../utils/derive-secret-hash';

async function setupTest() {
  const readOnlyToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

  const api = await startTestAPI({
    ...defaultAPISettings,
    readOnlyTokenHashes: [deriveSecretHash(readOnlyToken)],
  });

  const laptop = await createDeviceSession(api.context, 'laptop');
  const png = await encodeTestImage({ width: 4, height: 3 }, 'png');

  return {
    ...api,
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

  const seeded = await seedImage(ctx.context.log, {
    image: 'k3x9m2p7qa',
    source: 'draw',
    bytes: ctx.png,
    prompt: 'a harbour at dusk',
  });

  const earlierName = await seedImageName(ctx.context.log, {
    image: 'k3x9m2p7qa',
    name: 'harbour',
  });

  const latestName = await seedImageName(ctx.context.log, {
    image: 'k3x9m2p7qa',
    name: 'harbour at dusk',
  });

  const forgotten = await ctx.client.images.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    image: 'k3x9m2p7qa',
  });

  const sequences = [
    seeded.callSequence,
    seeded.sequence,
    earlierName.sequence,
    latestName.sequence,
  ];

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, sequences, limit: 10 });
  const entry = await readImageEntry(ctx.context.log, 'k3x9m2p7qa');
  const image = await ctx.client.images.read({ image: 'k3x9m2p7qa' });

  expect({
    forgottenAt: forgotten.forgottenAt,
    backup: forgotten.backup,
    erasable: entries.map((found) => found.record.erasable.status),
    image,
    assistantEntry: entry.kind,
  }).toStrictEqual({
    forgottenAt: expect.toBeValidDate(),
    backup: { state: 'pending' },
    erasable: ['shredded', 'shredded', 'shredded', 'shredded'],
    image: expect.objectContaining({ name: null, prompt: null, isForgotten: true }),
    assistantEntry: 'forgotten',
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
