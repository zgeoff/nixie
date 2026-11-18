import { expect, test } from 'bun:test';
import { seedCodeRunFiles } from '@heynixie/connectors/test-utils';
import { clientHeaderName } from '@heynixie/contract';
import type { LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import { seedDefinitionTask, seedEndedDefinitionRun } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  return { ...api, token: laptop.token, client: buildTestClient(api.url, laptop.token) };
}

test('#files.read returns the bytes of a file with its name and image type', async () => {
  const ctx = await setupTest();

  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  const seeded = await seedCodeRunFiles(ctx.context.log, {
    thread: 'conversation',
    writes: { 'out/charts/revenue.png': pngHeader },
  });

  const file = await ctx.client.files.read({ file: seeded.files[0]?.file ?? '' });
  const buffer = await file.arrayBuffer();

  const bytes = new Uint8Array(buffer);

  expect({ name: file.name, type: file.type, bytes }).toStrictEqual({
    name: 'revenue.png',
    type: 'image/png',
    bytes: pngHeader,
  });
});

test('#files.read serves a file of another thread to the owner', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunFiles(ctx.context.log, {
    thread: 'task-7',
    writes: { 'out/orders.csv': 'a,b\n' },
  });

  const file = await ctx.client.files.read({ file: seeded.files[0]?.file ?? '' });
  const text = await file.text();

  expect(text).toBe('a,b\n');
});

test('#files.read serves a type that is not an image as application/octet-stream', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunFiles(ctx.context.log, {
    thread: 'conversation',
    writes: { 'out/page.html': '<script>alert(1)</script>' },
  });

  const response = await fetch(`${ctx.url}/rpc/files/read`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ctx.token}`,
      [clientHeaderName]: 'test',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ json: { file: seeded.files[0]?.file } }),
  });

  const body = await response.text();

  expect(body).toMatch(/filename="page\.html"\r\nContent-Type: application\/octet-stream\r\n/u);
});

test('#files.read answers FILE_NOT_FOUND for an unknown ID', async () => {
  const ctx = await setupTest();

  const refused = ctx.client.files.read({ file: 'zzzzzzzzzz' });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({
    code: 'FILE_NOT_FOUND',
  });
});

test('#files.read answers FILE_FORGOTTEN after a forget of the run record', async () => {
  const ctx = await setupTest();

  const seeded = await seedCodeRunFiles(ctx.context.log, {
    thread: 'conversation',
    writes: { 'out/orders.csv': 'a,b\n' },
  });

  const row = await ctx.context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', seeded.resultSequence)
    .executeTakeFirst();

  invariant(typeof row?.key_id === 'string');

  await removeRecordKey(ctx.context.log, row.key_id);

  const refused = ctx.client.files.read({ file: seeded.files[0]?.file ?? '' });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({
    code: 'FILE_FORGOTTEN',
  });
});

test('#files.read refuses a call with no session', async () => {
  const ctx = await setupTest();

  const client = buildTestClient(ctx.url);
  const refused = client.files.read({ file: 'zzzzzzzzzz' });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('#files.list returns the files of the conversation and of a task, newest first, with the task name', async () => {
  const ctx = await setupTest();

  await seedCodeRunFiles(ctx.context.log, {
    thread: 'conversation',
    writes: { 'out/orders.csv': 'a,b\n' },
  });

  await seedCodeRunFiles(ctx.context.log, {
    thread: 'task-7',
    writes: { 'out/totals.csv': 'c\n' },
  });

  const listed = await ctx.client.files.list({});

  expect({
    files: listed.files.map((file) => [file.name, file.taskID, file.taskName, file.isSent]),
    nextCursor: listed.nextCursor,
  }).toStrictEqual({
    files: [
      ['totals.csv', 'task-7', 'task-7', false],
      ['orders.csv', null, null, false],
    ],
    nextCursor: null,
  });
});

test('#files.list lists only images with the image filter', async () => {
  const ctx = await setupTest();

  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  await seedCodeRunFiles(ctx.context.log, {
    thread: 'conversation',
    writes: { 'out/chart.png': pngHeader, 'out/orders.csv': 'a,b\n' },
  });

  const listed = await ctx.client.files.list({ kind: 'image' });

  expect(listed.files.map((file) => file.name)).toStrictEqual(['chart.png']);
});

test('#files.list names the task of a definition that left force', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes' },
  });

  await seedEndedDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: null });

  await seedCodeRunFiles(ctx.context.log, {
    thread: taskID,
    writes: { 'out/beds.csv': 'a\n' },
  });

  const listed = await ctx.client.files.list({});

  expect(listed.files.map((file) => [file.name, file.taskID, file.taskName])).toStrictEqual([
    ['beds.csv', taskID, 'Water the tomatoes'],
  ]);
});
