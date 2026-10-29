import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { removeRecordKey, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildLogReadImageTool } from './build-log-read-image-tool';
import { startTestMemory } from './test-utils';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';

async function setupTest() {
  const memory = await startTestMemory();

  return { log: memory.log, tool: buildLogReadImageTool(memory.log) };
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
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { eventID: String(photo.sequence), number: 2, mediaType: 'image/jpeg' },
    images: [{ mediaType: 'image/jpeg', bytes: new TextEncoder().encode('shelf-plan-B') }],
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

  const row = await ctx.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', photo.sequence)
    .executeTakeFirstOrThrow();

  invariant(row.key_id !== null);

  await removeRecordKey(ctx.log, row.key_id);

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
