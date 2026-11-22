import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import type { CodeRunFilesSeed } from '../test-utils/seed-code-run-files';
import { seedCodeRunFiles } from '../test-utils/seed-code-run-files';
import { startTestLog } from '../test-utils/start-test-log';
import { buildFileSendTool } from './build-file-send-tool';
import { listCodeFiles } from './list-code-files';

async function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const log = await startTestLog(clock);

  const sendFile = (file: string, thread: string) =>
    runToolCall(
      { tool: 'file.send', input: { file }, toolUseID: null },
      {
        runID: 'send-run',
        thread,
        logThread: thread,
        tools: ['file.send'],
        model: { model: 'model-a', profile: 'chat-direct' },
      },
      {
        registry: buildToolRegistry([buildFileSendTool({ log })]),
        decide: buildAllowingDecisionPoint(),
        log,
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        queue: {
          enqueue: () => Promise.reject(new Error('file.send runs direct')),
          readOpenRepeat: () => Promise.resolve(null),
          readOpenAsk: () => Promise.resolve(null),
          waitForOutcome: () => Promise.resolve(null),
        },
        queuedWaitMs: 1000,
      },
    );

  const forgetRecord = async (sequence: number) => {
    const row = await log.writer.db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('key_id')
      .where('sequence', '=', sequence)
      .executeTakeFirst();

    invariant(typeof row?.key_id === 'string');

    await removeRecordKey(log, row.key_id);
  };

  return {
    log,
    clock,
    sendFile,
    forgetRecord,
    writeRun: (seed: CodeRunFilesSeed) => seedCodeRunFiles(log, seed),
  };
}

test('it lists the files of the newest run first, in the order of the run', async () => {
  const ctx = await setupTest();

  await ctx.writeRun({ thread: 'conversation', writes: { 'out/a.csv': 'a', 'out/b.csv': 'b' } });
  await ctx.writeRun({ thread: 'task-2', writes: { 'out/c.csv': 'c' } });

  const listed = await listCodeFiles(ctx.log, { limit: 30 });

  expect(listed.files.map((file) => [file.name, file.thread, file.runFileCount])).toStrictEqual([
    ['c.csv', 'task-2', 1],
    ['a.csv', 'conversation', 2],
    ['b.csv', 'conversation', 2],
  ]);
});

test('it pages with a cursor and ends with a null cursor', async () => {
  const ctx = await setupTest();

  await ctx.writeRun({ thread: 'conversation', writes: { 'out/a.csv': 'a', 'out/b.csv': 'b' } });
  await ctx.writeRun({ thread: 'conversation', writes: { 'out/c.csv': 'c' } });

  const first = await listCodeFiles(ctx.log, { limit: 2 });
  const second = await listCodeFiles(ctx.log, { limit: 2, cursor: first.nextCursor ?? '' });

  expect({
    first: first.files.map((file) => file.name),
    hasMore: first.nextCursor !== null,
    second: second.files.map((file) => file.name),
    end: second.nextCursor,
  }).toStrictEqual({ first: ['c.csv', 'a.csv'], hasMore: true, second: ['b.csv'], end: null });
});

test('it lists only images with the image filter and only other files with the other filter', async () => {
  const ctx = await setupTest();

  await ctx.writeRun({
    thread: 'conversation',
    writes: {
      'out/chart.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
      'out/orders.csv': 'a,b',
    },
  });

  const images = await listCodeFiles(ctx.log, { kind: 'image', limit: 30 });
  const others = await listCodeFiles(ctx.log, { kind: 'other', limit: 30 });

  expect({
    images: images.files.map((file) => file.name),
    others: others.files.map((file) => file.name),
  }).toStrictEqual({ images: ['chart.png'], others: ['orders.csv'] });
});

test('it leaves out the kept streams of a run', async () => {
  const ctx = await setupTest();

  await ctx.writeRun({
    thread: 'conversation',
    writes: { 'out/a.csv': 'a' },
    longStdout: true,
  });

  const listed = await listCodeFiles(ctx.log, { limit: 30 });

  expect(listed.files.map((file) => file.name)).toStrictEqual(['a.csv']);
});

test('it leaves out the files of a run whose result record a forget made unreadable', async () => {
  const ctx = await setupTest();
  const forgotten = await ctx.writeRun({ thread: 'conversation', writes: { 'out/a.csv': 'a' } });

  await ctx.writeRun({ thread: 'conversation', writes: { 'out/b.csv': 'b' } });
  await ctx.forgetRecord(forgotten.resultSequence);

  const listed = await listCodeFiles(ctx.log, { limit: 30 });

  expect(listed.files.map((file) => file.name)).toStrictEqual(['b.csv']);
});

test('it marks a file that file.send sent', async () => {
  const ctx = await setupTest();

  const seeded = await ctx.writeRun({
    thread: 'conversation',
    writes: { 'out/a.csv': 'a', 'out/b.csv': 'b' },
  });

  await ctx.sendFile(seeded.files[1]?.file ?? '', 'conversation');

  const listed = await listCodeFiles(ctx.log, { limit: 30 });

  expect(listed.files.map((file) => [file.name, file.isSent])).toStrictEqual([
    ['a.csv', false],
    ['b.csv', true],
  ]);
});
