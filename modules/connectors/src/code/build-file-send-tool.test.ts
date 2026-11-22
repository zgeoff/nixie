import { expect, test } from 'bun:test';
import type { JSONObject, LogTables } from '@heynixie/log';
import { readRecords, removeRecordKey } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import type { ToolRun } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { buildToolErrorResult } from '../test-utils/build-tool-error-result';
import type { StubProgram } from '../test-utils/make-stub-code-exec';
import { makeStubCodeExec } from '../test-utils/make-stub-code-exec';
import { readCodeRunFiles } from '../test-utils/read-code-run-files';
import { seedImage } from '../test-utils/seed-image';
import { startTestLog } from '../test-utils/start-test-log';
import { buildCodeRunTool } from './build-code-run-tool';
import { buildFileSendTool } from './build-file-send-tool';
import type { CodeFileSendsTables } from './code-files-tables';

async function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const log = await startTestLog(clock);

  const baseRun: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: ['code.run', 'file.send'],
    model: { model: 'model-a', profile: 'chat-direct' },
  };

  const start = (program: StubProgram) => {
    const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
      exec: makeStubCodeExec(program),
    });

    const codeTool = buildCodeRunTool({
      log,
      adapter,
      clock,
      logger: () => {},
      image: 'nixie-code-dddddddddddd',
      imageLongEdge: 1568,
      notes: { readBody: () => Promise.resolve(null) },
      readSkills: () => Promise.resolve({ kind: 'ok', skills: [] }),
    });

    const options = {
      registry: buildToolRegistry([codeTool, buildFileSendTool({ log })]),
      decide: buildAllowingDecisionPoint(),
      log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      queue: {
        enqueue: () => Promise.reject(new Error('the tools run direct')),
        readOpenRepeat: () => Promise.resolve(null),
        readOpenAsk: () => Promise.resolve(null),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    };

    const call = (tool: string, input: JSONObject, onRun: Partial<ToolRun> = {}) =>
      runToolCall({ tool, input, toolUseID: null }, { ...baseRun, ...onRun }, options);

    return {
      runCode: () => call('code.run', { language: 'python', program: 'print(1)' }),
      send: (input: JSONObject, onRun: Partial<ToolRun> = {}) => call('file.send', input, onRun),
    };
  };

  const readSends = () =>
    log.writer.db
      .$extendTables<CodeFileSendsTables>()
      .selectFrom('code_file_sends')
      .selectAll()
      .execute();

  const readResultSequences = async () => {
    const entries = await readRecords(log, { afterSequence: 0, kinds: ['tool_result'] });

    return entries.map((entry) => entry.record.sequence);
  };

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

  return { start, readSends, readResultSequences, forgetRecord, log };
}

test('it sends a file that a code run wrote and records the send beside the result', async () => {
  const ctx = await setupTest();

  const code = ctx.start(() => ({ writes: { 'out/charts/orders.csv': 'a,b\n1,2\n' } }));

  const ran = await code.runCode();

  const [written] = readCodeRunFiles(ran);

  invariant(written);

  const sent = await code.send({ file: written.file, caption: 'Orders by region' });
  const [, sendSequence] = await ctx.readResultSequences();
  const sends = await ctx.readSends();

  expect({ sent, sends }).toStrictEqual({
    sent: {
      content: [],
      structuredContent: {
        file: written.file,
        name: 'orders.csv',
        bytes: 8,
        mediaType: 'text/csv',
      },
    },
    sends: [{ sequence: sendSequence ?? 0, file_id: written.file, thread: 'conversation' }],
  });
});

test('it refuses a file of another thread', async () => {
  const ctx = await setupTest();

  const code = ctx.start(() => ({ writes: { 'out/a.csv': 'x' } }));

  const ran = await code.runCode();

  const [written] = readCodeRunFiles(ran);

  invariant(written);

  const result = await code.send({ file: written.file }, { thread: 'task-2', logThread: 'task-2' });
  const sends = await ctx.readSends();

  expect({ result, sends }).toStrictEqual({
    result: buildToolErrorResult(
      `No file of a code run on this thread and no image has the ID ${written.file}.`,
    ),
    sends: [],
  });
});

test('it refuses a file whose result record a forget made unreadable', async () => {
  const ctx = await setupTest();

  const code = ctx.start(() => ({ writes: { 'out/a.csv': 'x' } }));

  const ran = await code.runCode();

  const [written] = readCodeRunFiles(ran);

  const [runSequence] = await ctx.readResultSequences();

  invariant(written && runSequence !== undefined);

  await ctx.forgetRecord(runSequence);

  const result = await code.send({ file: written.file });

  expect(result).toStrictEqual(buildToolErrorResult(`The file ${written.file} was forgotten.`));
});

test('it refuses a kept stream of a code run', async () => {
  const ctx = await setupTest();

  const code = ctx.start(() => ({ stdout: 'x'.repeat(40_000) }));

  const ran = await code.runCode();

  const block = ran.content.find((candidate) => candidate.type === 'text');
  const raw: unknown = block === undefined ? ran.structuredContent : JSON.parse(block.text);
  const stream = z.object({ stdout: z.object({ file: z.string() }) }).parse(raw).stdout;

  const result = await code.send({ file: stream.file });

  expect(result).toStrictEqual(
    buildToolErrorResult(
      `The file ${stream.file} is the output of a code run, not a file it wrote. Send a file from its files list.`,
    ),
  );
});

test('it refuses an unknown file ID', async () => {
  const ctx = await setupTest();

  const code = ctx.start(() => ({}));

  const result = await code.send({ file: 'zzzzzzzzzz' });

  expect(result).toStrictEqual(
    buildToolErrorResult(
      'No file of a code run on this thread and no image has the ID zzzzzzzzzz.',
    ),
  );
});

test('it sends an image by its short ID from any thread and writes no send row', async () => {
  const ctx = await setupTest();

  const code = ctx.start(() => ({}));

  await seedImage(ctx.log, { image: 'im4k9q2x7a', source: 'draw', bytes: new Uint8Array(30) });

  const sent = await code.send(
    { file: 'im4k9q2x7a', caption: 'The cove' },
    { thread: 'task-2', logThread: 'task-2' },
  );

  const sends = await ctx.readSends();

  expect({ sent, sends }).toStrictEqual({
    sent: {
      content: [],
      structuredContent: {
        file: 'im4k9q2x7a',
        name: 'im4k9q2x7a.png',
        bytes: 30,
        mediaType: 'image/png',
      },
    },
    sends: [],
  });
});

test('it refuses an image whose result record a forget made unreadable', async () => {
  const ctx = await setupTest();

  const code = ctx.start(() => ({}));

  const seeded = await seedImage(ctx.log, {
    image: 'im4k9q2x7a',
    source: 'draw',
    bytes: new Uint8Array(30),
  });

  await ctx.forgetRecord(seeded.sequence);

  const result = await code.send({ file: 'im4k9q2x7a' });

  expect(result).toStrictEqual(buildToolErrorResult('The image im4k9q2x7a was forgotten.'));
});
