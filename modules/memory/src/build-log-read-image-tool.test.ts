import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { buildLogReadImageTool } from './build-log-read-image-tool';
import { buildMomentReadTool } from './build-moment-read-tool';
import { startTestMemory } from './test-utils';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    log: memory.log,
    moments: memory.store.moments,
    tool: buildLogReadImageTool(memory.log),
    readTool: buildMomentReadTool(memory.store.moments),
  };
}

test("it returns an owner's image as image input with its event, number and media type", async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: 'Two shelf plans', spans: [{ start: 0, end: 15, source: 'typed' }] },
      attachments: [
        new TextEncoder().encode('shelf-plan-A'),
        new TextEncoder().encode('shelf-plan-B'),
      ],
    },
  ]);

  invariant(photo);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read_image',
      input: { eventID: `#${String(photo.sequence)}`, number: 2 },
      toolUseID: null,
    },
    buildMockToolContext({
      session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { eventID: String(photo.sequence), number: 2, mediaType: 'image/jpeg' },
    images: [{ mediaType: 'image/jpeg', bytes: new TextEncoder().encode('shelf-plan-B') }],
  });
});

test("it reserves the image it returns in the session's image budget", async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The shelf plan', spans: [{ start: 0, end: 14, source: 'typed' }] },
      attachments: [new TextEncoder().encode('shelf-plan-A')],
    },
  ]);

  invariant(photo);

  const reserveImages = mock(() => true);

  await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read_image',
      input: { eventID: String(photo.sequence), number: 1 },
      toolUseID: null,
    },
    buildMockToolContext({ session: { key: 'session-a', invalidatedThrough: 0, reserveImages } }),
  );

  expect(reserveImages).toHaveBeenCalledExactlyOnceWith([
    { mediaType: 'image/png', bytes: new TextEncoder().encode('shelf-plan-A') },
  ]);
});

test('it refuses an image that would pass the session image budget', async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The shelf plan', spans: [{ start: 0, end: 14, source: 'typed' }] },
      attachments: [new TextEncoder().encode('shelf-plan-A')],
    },
  ]);

  invariant(photo);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read_image',
      input: { eventID: String(photo.sequence), number: 1 },
      toolUseID: null,
    },
    buildMockToolContext({
      session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => false },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'image unavailable: this session holds as many images as it can take',
  });
});

test('it refuses an image the owner forgot as image unavailable', async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The garden gate', spans: [{ start: 0, end: 15, source: 'typed' }] },
      attachments: [new TextEncoder().encode('garden-gate')],
    },
  ]);

  invariant(photo);

  await removeTestRecordKey(ctx.log, photo.sequence);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read_image',
      input: { eventID: String(photo.sequence), number: 1 },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'image unavailable' });
});

test("it refuses an owner's image from another thread as image unavailable", async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-garden',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The garden gate', spans: [{ start: 0, end: 15, source: 'typed' }] },
      attachments: [new TextEncoder().encode('garden-gate')],
    },
  ]);

  invariant(photo);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read_image',
      input: { eventID: String(photo.sequence), number: 1 },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'conversation' }),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'image unavailable' });
});

test('it refuses an image that a record other than an owner message holds as image unavailable', async () => {
  const ctx = await setupTest();

  const [reply] = await writeRecords(ctx.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'A drawing of the gate' },
      attachments: [new TextEncoder().encode('drawn-gate')],
    },
  ]);

  invariant(reply);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read_image',
      input: { eventID: String(reply.sequence), number: 1 },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'image unavailable' });
});

test('it refuses a number past the images of the message as image unavailable', async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The garden gate', spans: [{ start: 0, end: 15, source: 'typed' }] },
      attachments: [new TextEncoder().encode('garden-gate')],
    },
  ]);

  invariant(photo);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'log.read_image',
      input: { eventID: String(photo.sequence), number: 2 },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'image unavailable' });
});

test('it opens the photo that a moment.read record points to, by its eventID and n', async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: 'Two shelf plans', spans: [{ start: 0, end: 15, source: 'typed' }] },
      attachments: [
        new TextEncoder().encode('shelf-plan-A'),
        new TextEncoder().encode('shelf-plan-B'),
      ],
    },
  ]);

  invariant(photo);

  const kept = await ctx.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: photo.sequence,
    lastSequence: photo.sequence,
    title: 'The shelf plans',
  });

  invariant(kept.status === 'written');

  const read = await ctx.readTool.run(
    { callID: 'call-1', tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: null },
    buildMockToolContext(),
  );

  invariant(read.status === 'ok');

  const shown = JSON.stringify(read.result);
  const eventID = /"eventID":"(?<id>\d+)"/u.exec(shown)?.groups?.['id'];

  const numbers = [...shown.matchAll(/"n":(?<number>\d+)/gu)].map(
    (found) => found.groups?.['number'],
  );

  invariant(eventID !== undefined);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-2',
      tool: 'log.read_image',
      input: { eventID, number: Number(numbers[1]) },
      toolUseID: null,
    },
    buildMockToolContext({
      session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => true },
    }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { eventID: String(photo.sequence), number: 2, mediaType: 'image/jpeg' },
    images: [{ mediaType: 'image/jpeg', bytes: new TextEncoder().encode('shelf-plan-B') }],
  });
});

test('it refuses a photo that a moment.read record pointed to once the owner forgot the message', async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The shelf plan', spans: [{ start: 0, end: 14, source: 'typed' }] },
      attachments: [new TextEncoder().encode('shelf-plan-A')],
    },
  ]);

  invariant(photo);

  const kept = await ctx.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: photo.sequence,
    lastSequence: photo.sequence,
    title: 'The shelf plan',
  });

  invariant(kept.status === 'written');

  await removeTestRecordKey(ctx.log, photo.sequence);

  const read = await ctx.readTool.run(
    { callID: 'call-1', tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: null },
    buildMockToolContext(),
  );

  invariant(read.status === 'ok');

  const outcome = await ctx.tool.run(
    {
      callID: 'call-2',
      tool: 'log.read_image',
      input: { eventID: String(photo.sequence), number: 1 },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(read.result).toMatchObject({ records: [{ isGap: true }] });
  expect(outcome).toStrictEqual({ status: 'error', message: 'image unavailable' });
});

test('it refuses a photo that a moment.read record points to when the moment is on another thread', async () => {
  const ctx = await setupTest();

  const [photo] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-garden',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The garden gate', spans: [{ start: 0, end: 15, source: 'typed' }] },
      attachments: [new TextEncoder().encode('garden-gate')],
    },
  ]);

  invariant(photo);

  const kept = await ctx.moments.keep({
    caller: { kind: 'model', thread: 'task-garden', model: 'claude-test-4' },
    thread: 'task-garden',
    firstSequence: photo.sequence,
    lastSequence: photo.sequence,
    title: 'The garden gate',
  });

  invariant(kept.status === 'written');

  const read = await ctx.readTool.run(
    { callID: 'call-1', tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: null },
    buildMockToolContext({ thread: 'task-garden' }),
  );

  invariant(read.status === 'ok');

  const shown = JSON.stringify(read.result);
  const eventID = /"eventID":"(?<id>\d+)"/u.exec(shown)?.groups?.['id'];

  const numbers = [...shown.matchAll(/"n":(?<number>\d+)/gu)].map(
    (found) => found.groups?.['number'],
  );

  invariant(eventID !== undefined);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-2',
      tool: 'log.read_image',
      input: { eventID, number: Number(numbers[0]) },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'conversation' }),
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'image unavailable' });
});
