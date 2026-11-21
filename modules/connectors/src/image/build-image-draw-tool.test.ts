import { expect, test } from 'bun:test';
import { readBudgetLedger } from '@heynixie/budgets';
import { readRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { runToolCall } from '@heynixie/tools';
import type { ToolRun } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildStubImageProvider } from '../test-utils/build-stub-image-provider';
import { encodeTestImage } from '../test-utils/encode-test-image';
import { readImageID, readToolResult } from '../test-utils/read-tool-result';
import { seedOwnerPhoto } from '../test-utils/seed-owner-photo';
import { startTestImages } from '../test-utils/start-test-images';

async function setupTest() {
  const main = buildStubImageProvider();
  const second = buildStubImageProvider();

  const ctx = await startTestImages({ providers: { main, second } });

  return {
    ...ctx,
    main,
    second,
    readSpentMicros: async () => {
      const ledger = await readBudgetLedger(ctx.log.writer.db, ctx.budgets, 'image.draw-day');

      return ledger?.spentMicros;
    },
  };
}

test('it draws an image from a prompt, shows it, and tells how many more fit', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.draw', { prompt: 'a small cove at dusk' });

  expect(readToolResult(reply)).toStrictEqual({
    image: expect.stringMatching(/^[a-z0-9]{10}$/u),
    from: null,
    profile: 'main',
    size: '100x50',
    isShown: true,
    roomLeft: 3,
  });

  expect(reply.content.map((block) => block.type)).toStrictEqual(['text', 'image']);
});

test('it charges the price of the size the profile lists', async () => {
  const ctx = await setupTest();

  await ctx.call('image.draw', { prompt: 'a cove', size: '1536x1024' });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(60_000);
});

test('it sends the prompt, the profile model and the size to the provider', async () => {
  const ctx = await setupTest();

  await ctx.call('image.draw', { prompt: 'a cove', size: '1024x1536' });

  expect(
    ctx.main.requests.map((request) => [request.model, request.prompt, request.size]),
  ).toStrictEqual([['model-a', 'a cove', '1024x1536']]);
});

test('it edits a stored image by sending it padded to the size nearest its shape, and links the edit to it', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'a cove' });

  const edit = await ctx.read('image.draw', {
    prompt: 'move the boat right',
    from: readImageID(first),
  });

  const sent = ctx.main.requests[1]?.source;

  const stored = await new Bun.Image(sent?.bytes ?? new Uint8Array(0)).metadata();

  expect(edit).toMatchObject({ from: readImageID(first) });
  expect(stored).toMatchObject({ width: 1536, height: 1024 });
  expect(ctx.main.requests[1]?.references).toStrictEqual([]);
});

test('it sends each reference image beside the prompt', async () => {
  const ctx = await setupTest();
  const keeper = await ctx.read('image.draw', { prompt: 'a keeper' });

  await ctx.call('image.draw', { prompt: 'the keeper rowing', references: [readImageID(keeper)] });

  expect(ctx.main.requests[1]?.references.map((reference) => reference.mediaType)).toStrictEqual([
    'image/png',
  ]);
});

test('it keeps every attempt, so image.list finds each edit of an image', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'a cove' });
  const second = await ctx.read('image.draw', { prompt: 'warmer light', from: readImageID(first) });

  await ctx.call('image.draw', { prompt: 'a lighthouse' });

  const edits = await ctx.read('image.list', { from: readImageID(first) });

  expect(edits).toStrictEqual({
    images: [
      {
        image: readImageID(second),
        name: null,
        isPinned: false,
        from: readImageID(first),
        prompt: 'warmer light',
        isForgotten: false,
        at: '2026-11-21T08:00:00.000Z',
      },
    ],
    next: null,
  });
});

test('it returns a refusal with the other profiles, and credits the charge', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => ({
    kind: 'refused',
    reason: 'safety',
    message: 'The request was rejected.',
    isBilled: false,
  }));

  const reply = await ctx.call('image.draw', { prompt: 'a keeper asleep' });

  expect(readToolResult(reply)).toStrictEqual({
    refused: {
      code: 'IMAGE_REFUSED',
      message: 'The request was rejected.',
      profile: 'main',
      reason: 'safety',
    },
    profiles: ['second'],
  });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(0);
});

test('it lets the assistant retry a refused prompt on another profile', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => ({
    kind: 'refused',
    reason: 'safety',
    message: 'The request was rejected.',
    isBilled: false,
  }));

  await ctx.call('image.draw', { prompt: 'a keeper asleep' });

  const retry = await ctx.read('image.draw', { prompt: 'a keeper asleep', profile: 'second' });

  expect(retry).toMatchObject({ profile: 'second', isShown: true });
  expect(ctx.second.requests.map((request) => request.model)).toStrictEqual(['model-b']);
});

test('it keeps the charge of a refusal the provider billed', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => ({ kind: 'refused', reason: 'other', message: 'no', isBilled: true }));

  await ctx.call('image.draw', { prompt: 'a keeper asleep' });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(40_000);
});

test('it credits a failure the provider did not bill', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => ({
    kind: 'failed',
    reason: 'the provider answered 503',
    isBilled: false,
  }));

  const reply = await ctx.call('image.draw', { prompt: 'a cove' });

  expect(readToolResult(reply)).toStrictEqual({
    refused: { code: 'IMAGE_FAILED', message: 'The provider failed: the provider answered 503' },
  });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(0);
});

test('it keeps the charge of a failure the provider billed', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => ({ kind: 'failed', reason: 'the reply was cut', isBilled: true }));

  await ctx.call('image.draw', { prompt: 'a cove' });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(40_000);
});

test('it keeps the charge when the provider throws, because the call may have been billed', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => {
    throw new Error('connection reset by the host');
  });

  const reply = await ctx.call('image.draw', { prompt: 'a cove' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'IMAGE_FAILED' } });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(40_000);
});

test('it keeps the charge of a draw that passes its time limit', async () => {
  const ctx = await startTestImages({
    providers: {
      main: {
        takes: { source: true, references: true },
        draw: (request) =>
          new Promise((_resolve, reject) => {
            request.signal.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }),
      },
      second: buildStubImageProvider(),
    },
    drawTimeoutMs: 20,
  });

  const reply = await ctx.call('image.draw', { prompt: 'a cove' });
  const ledger = await readBudgetLedger(ctx.log.writer.db, ctx.budgets, 'image.draw-day');

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'IMAGE_TIMEOUT' } });
  expect(ledger?.spentMicros).toBe(40_000);
});

test('it keeps the charge of a reply that does not decode as a picture', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => ({
    kind: 'image',
    mediaType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
  }));

  const reply = await ctx.call('image.draw', { prompt: 'a cove' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'IMAGE_FAILED' } });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(40_000);
});

test('it keeps the charge of a reply over 8 MiB', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(() => ({
    kind: 'image',
    mediaType: 'image/png',
    bytes: new Uint8Array(8 * 1024 * 1024 + 1),
  }));

  const reply = await ctx.call('image.draw', { prompt: 'a cove' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'IMAGE_FAILED' } });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(40_000);
});

test('it converts a reply that is no PNG, so the stored image is a PNG', async () => {
  const ctx = await setupTest();

  ctx.main.replyWith(async () => ({
    kind: 'image',
    mediaType: 'image/jpeg',
    bytes: await encodeTestImage({ width: 60, height: 40 }, 'jpeg'),
  }));

  const drawn = await ctx.read('image.draw', { prompt: 'a cove' });
  const read = await ctx.call('image.read', { image: readImageID(drawn) });

  expect(readToolResult(read)).toMatchObject({ size: '60x40' });
});

test('it refuses an unknown image before any charge, and never calls the provider', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.draw', { prompt: 'a cove', from: 'nosuchimage' });

  expect(readToolResult(reply)).toStrictEqual({
    refused: { code: 'UNKNOWN_IMAGE', message: 'The from nosuchimage is no image.' },
  });

  expect(ctx.main.requests).toStrictEqual([]);

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(0);
});

test('it refuses an unknown reference by name before any charge', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.draw', { prompt: 'a cove', references: ['nosuchimage'] });

  expect(readToolResult(reply)).toMatchObject({
    refused: { code: 'UNKNOWN_IMAGE', message: 'The reference nosuchimage is no image.' },
  });
});

test('it refuses a forgotten image before any charge, naming it', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'a cove' });

  const [stored] = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    order: 'newest',
    limit: 1,
  });

  invariant(stored, 'the draw wrote a result record');

  await removeTestRecordKey(ctx.log, stored.record.sequence);

  const reply = await ctx.call('image.draw', { prompt: 'warmer', from: readImageID(first) });

  expect(readToolResult(reply)).toStrictEqual({
    refused: {
      code: 'IMAGE_FORGOTTEN',
      message: `The image ${readImageID(first)} was forgotten.`,
    },
  });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(40_000);
});

test('it refuses an unknown profile before any charge, listing the profiles', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.draw', { prompt: 'a cove', profile: 'nosuchprofile' });

  expect(readToolResult(reply)).toMatchObject({
    refused: { code: 'UNKNOWN_PROFILE' },
    profiles: ['main', 'second'],
  });

  const spentMicros = await ctx.readSpentMicros();

  expect(spentMicros).toBe(0);
});

test('it refuses an edit on a profile that takes no image to edit', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'a cove' });

  ctx.second.takes.source = false;

  const reply = await ctx.call('image.draw', {
    prompt: 'warmer',
    from: readImageID(first),
    profile: 'second',
  });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'NO_EDIT' } });
  expect(ctx.second.requests).toStrictEqual([]);
});

test('it refuses references on a profile that takes none', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'a cove' });

  ctx.second.takes.references = false;

  const reply = await ctx.call('image.draw', {
    prompt: 'a keeper',
    references: [readImageID(first)],
    profile: 'second',
  });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'NO_EDIT' } });
});

test('it refuses a draw when the session caps leave no room, before any charge', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
    caps: { bytes: 24 * 1024 * 1024, count: 0 },
  });

  const reply = await ctx.call('image.draw', { prompt: 'a cove' });
  const ledger = await readBudgetLedger(ctx.log.writer.db, ctx.budgets, 'image.draw-day');

  expect(readToolResult(reply)).toMatchObject({
    refused: { code: 'IMAGE_CAPS_FULL' },
    roomLeft: 0,
  });

  expect(ledger?.spentMicros).toBe(0);
});

test('it counts a drawn image against the session caps', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
    caps: { bytes: 24 * 1024 * 1024, count: 2 },
  });

  const first = await ctx.read('image.draw', { prompt: 'a cove' });
  const second = await ctx.read('image.draw', { prompt: 'a cove again' });
  const third = await ctx.call('image.draw', { prompt: 'a third cove' });

  expect([first['roomLeft'], second['roomLeft']]).toStrictEqual([1, 0]);
  expect(readToolResult(third)).toMatchObject({ refused: { code: 'IMAGE_CAPS_FULL' } });
});

test('it refuses a draw once the day budget is spent, and the provider hears nothing', async () => {
  const ctx = await setupTest();

  for (let draw = 0; draw < 34; draw += 1) {
    await ctx.call('image.draw', { prompt: 'a cove', size: '1536x1024' });
  }

  const reply = await ctx.call('image.draw', { prompt: 'one more cove', size: '1536x1024' });

  expect(reply.content[0]).toMatchObject({ type: 'text' });
  expect(ctx.main.requests).toHaveLength(33);
});

test('it records the cost under the hidden field, never in the result the model reads', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.draw', { prompt: 'a cove' });

  const [stored] = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    order: 'newest',
    limit: 1,
  });

  expect(JSON.stringify(reply)).not.toContain('costUSD');

  expect(stored?.record.erasable).toMatchObject({
    fields: { hidden: { costUSD: 0.04, model: 'model-a' } },
  });
});

test('it keeps a photo draw from the provider until the owner allows it', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
    rules: [],
  });

  const photo = await seedOwnerPhoto(ctx.log, { thread: 'conversation', width: 64, height: 48 });
  const imported = await ctx.read('image.import', { photo: { eventID: String(photo), number: 1 } });

  const reply = await ctx.call('image.draw', {
    prompt: 'a cartoon of this',
    from: readImageID(imported),
  });

  expect(reply.content[0]).toMatchObject({
    type: 'text',
    text: expect.stringContaining('Waiting for approval'),
  });
});

test('it runs a photo draw at once when a rule allows sends to that provider', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
    rules: [
      {
        id: 'allow-openai',
        revision: 1,
        rule: {
          id: 'allow-openai',
          outcome: 'allow',
          effects: ['fetch', 'send'],
          destinations: ['openai'],
        },
      },
    ],
  });

  const photo = await seedOwnerPhoto(ctx.log, { thread: 'conversation', width: 64, height: 48 });
  const imported = await ctx.read('image.import', { photo: { eventID: String(photo), number: 1 } });

  const reply = await ctx.call('image.draw', {
    prompt: 'a cartoon of this',
    from: readImageID(imported),
  });

  expect(readToolResult(reply)).toMatchObject({ from: readImageID(imported), profile: 'main' });
});

test('it runs a draw from a drawn image without asking, as it sends no photo', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
    rules: [],
  });

  const first = await ctx.read('image.draw', { prompt: 'a cove' });
  const edit = await ctx.read('image.draw', { prompt: 'warmer', from: readImageID(first) });

  expect(edit).toMatchObject({ from: readImageID(first) });
});

test('it lets only one of two draws side by side take the last room, and charges only that one', async () => {
  const main = buildStubImageProvider();

  const ctx = await startTestImages({
    providers: { main, second: buildStubImageProvider() },
    caps: { bytes: 24 * 1024 * 1024, count: 1 },
  });

  const replies = await Promise.all([
    ctx.call('image.draw', { prompt: 'a cove' }),
    ctx.call('image.draw', { prompt: 'another cove' }),
  ]);

  const ledger = await readBudgetLedger(ctx.log.writer.db, ctx.budgets, 'image.draw-day');

  const refusals = replies
    .map((reply) => readToolResult(reply))
    .filter((result) => 'refused' in result);

  expect(refusals).toStrictEqual([
    expect.objectContaining({ refused: { code: 'IMAGE_CAPS_FULL', message: expect.any(String) } }),
  ]);

  expect(main.requests).toHaveLength(1);
  expect(ledger?.spentMicros).toBe(40_000);
});

test('it keeps the last room for the draw that holds it while its picture is fitted', async () => {
  const main = buildStubImageProvider();

  const large = await encodeTestImage({ width: 3000, height: 2000 }, 'png');

  main.replyWith(() => ({ kind: 'image', mediaType: 'image/png', bytes: large }));

  const ctx = await startTestImages({
    providers: { main, second: buildStubImageProvider() },
    caps: { bytes: 24 * 1024 * 1024, count: 1 },
  });

  const session = ctx.run.session;

  invariant(session?.releaseImageRoom !== undefined);

  const release = session.releaseImageRoom;
  const rivals: ReturnType<typeof ctx.call>[] = [];

  // The first release is the draw giving up its hold. A draw that starts then sees the room as
  // free only when the hold went before the picture was reserved.
  const watchedRun: ToolRun = {
    ...ctx.run,
    session: {
      ...session,
      releaseImageRoom: (key) => {
        release(key);

        if (rivals.length === 0) {
          rivals.push(
            runToolCall(
              { tool: 'image.draw', input: { prompt: 'another cove' }, toolUseID: null },
              watchedRun,
              ctx.toolOptions,
            ),
          );
        }
      },
    },
  };

  const first = await runToolCall(
    { tool: 'image.draw', input: { prompt: 'a cove' }, toolUseID: null },
    watchedRun,
    ctx.toolOptions,
  );

  const [rival] = rivals;

  invariant(rival !== undefined);

  const second = await rival;
  const ledger = await readBudgetLedger(ctx.log.writer.db, ctx.budgets, 'image.draw-day');

  expect(readToolResult(first)).toMatchObject({ isShown: true });
  expect(readToolResult(second)).toMatchObject({ refused: { code: 'IMAGE_CAPS_FULL' } });
  expect(main.requests).toHaveLength(1);
  expect(ledger?.spentMicros).toBe(40_000);
});
