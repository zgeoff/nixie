import { expect, test } from 'bun:test';
import { readRecordAttachments, readRecords, removeRecordKey, writeRecords } from '@heynixie/log';
import type { LogTables } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import type { MemoryKillRead } from '@heynixie/sandbox';
import { waitForCondition } from '@heynixie/testing';
import type { ToolImage, ToolRun } from '@heynixie/tools';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { parseFencedResult } from '@heynixie/tools/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import type { StubSandboxAdapterOptions } from '../test-utils/build-stub-sandbox-adapter';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { buildToolErrorResult } from '../test-utils/build-tool-error-result';
import { encodeTestImage } from '../test-utils/encode-test-image';
import type { StubProgram } from '../test-utils/make-stub-code-exec';
import { makeStubCodeExec } from '../test-utils/make-stub-code-exec';
import { readCodeRunFiles } from '../test-utils/read-code-run-files';
import { seedImage } from '../test-utils/seed-image';
import { startTestLog } from '../test-utils/start-test-log';
import { writeWebFetchPage } from '../web/write-web-fetch-page';
import { buildCodeRunTool } from './build-code-run-tool';
import { makeCodeRunCleanup } from './make-code-run-cleanup';
import type { CodeSkill, SkillLookup } from './resolve-code-run-inputs';

interface ToolConfig {
  readonly program?: StubProgram;
  readonly adapter?: StubSandboxAdapterOptions;
  readonly skills?: readonly CodeSkill[];
  readonly notes?: Readonly<Record<string, string>>;
  readonly listingCutBytes?: number;
  readonly growAfterListing?: Readonly<Record<string, Uint8Array<ArrayBuffer>>>;
}

async function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const log = await startTestLog(clock);

  const baseRun: ToolRun = {
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['code.run'],
    model: { model: 'model-a', profile: 'chat-direct' },
  };

  const start = (config: ToolConfig = {}) => {
    const exec = makeStubCodeExec(config.program ?? (() => ({})), {
      ...(config.listingCutBytes === undefined ? {} : { listingCutBytes: config.listingCutBytes }),
      ...(config.growAfterListing === undefined
        ? {}
        : { growAfterListing: config.growAfterListing }),
    });

    const adapter = buildStubSandboxAdapter(() => Promise.resolve(0), {
      ...config.adapter,
      exec,
    });

    const tool = buildCodeRunTool({
      log,
      adapter,
      clock,
      logger: () => {},
      image: 'nixie-code-dddddddddddd',
      imageLongEdge: 1568,
      notes: { readBody: (shortID) => Promise.resolve(config.notes?.[shortID] ?? null) },
      readSkills: (_run, names): Promise<SkillLookup> => {
        const found = (config.skills ?? []).filter((skill) => names.includes(skill.name));
        const missing = names.find((name) => !found.some((skill) => skill.name === name));

        const lookup: SkillLookup =
          missing === undefined
            ? { kind: 'ok', skills: found }
            : { kind: 'missing', name: missing };

        return Promise.resolve(lookup);
      },
    });

    const options = {
      registry: buildToolRegistry([tool]),
      decide: buildAllowingDecisionPoint(),
      log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      queue: {
        enqueue: () => Promise.reject(new Error('code.run runs direct')),
        readOpenRepeat: () => Promise.resolve(null),
        readOpenAsk: () => Promise.resolve(null),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    };

    return {
      adapter,
      call: (input: Record<string, unknown>, run: Partial<ToolRun> = {}) =>
        runToolCall(
          {
            tool: 'code.run',
            input: { language: 'python', program: 'print(1)', ...input },
            toolUseID: null,
          },
          { ...baseRun, ...run },
          options,
        ),
    };
  };

  const readResultRecords = async () => {
    const entries = await readRecords(log, { afterSequence: 0 });

    return entries.filter((entry) => entry.record.kind === 'tool_result');
  };

  const readCallRecords = async () => {
    const entries = await readRecords(log, { afterSequence: 0 });

    return entries.filter((entry) => entry.record.kind === 'tool_called');
  };

  const countStartedPrograms = (adapter: ReturnType<typeof start>['adapter']) =>
    adapter.execs.filter((exec) => exec.command.argv[0] === 'setpriv').length;

  const okResult = {
    exitCode: 0,
    stdout: { text: '', bytes: 0, isCut: false, file: null },
    stderr: { text: '', bytes: 0, isCut: false, file: null },
    files: [],
    limit: null,
    seconds: 1,
  };

  const destroyBehind = async (adapter: ReturnType<typeof start>['adapter'], id: string) => {
    const sandbox = await adapter.read(id);

    await sandbox?.destroy();
  };

  const probeAccepted = async (call: ReturnType<typeof start>['call']) => {
    const result = await call({});

    return result.isError !== true;
  };

  return {
    clock,
    log,
    start,
    readResultRecords,
    readCallRecords,
    countStartedPrograms,
    okResult,
    destroyBehind,
    probeAccepted,
  };
}

test('it creates a code sandbox with no egress, no grant, no tool route and the code size row', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  await code.call({});

  expect(code.adapter.created).toStrictEqual([
    {
      id: expect.any(String),
      spec: {
        kind: 'code_run',
        image: 'nixie-code-dddddddddddd',
        owner: expect.stringMatching(/^code_run:[\da-f-]{36}$/u),
        egress: { kind: 'none' },
        grants: [],
        toolRoute: false,
        limits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
      },
    },
  ]);
});

test('it returns the output and the exit code of a program that ends', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ stdout: 'north 412.50\n', code: 0, durationMs: 2400 }),
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toStrictEqual({
    ...ctx.okResult,
    stdout: { text: 'north 412.50\n', bytes: 13, isCut: false, file: null },
    seconds: 2.4,
  });
});

test('it runs the program as the code user in the work folder, beside no other file', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  await code.call({ language: 'typescript', program: 'console.log(1)' });

  const program = code.adapter.execs.find((exec) => exec.command.argv[0] === 'setpriv');

  expect(program?.command).toMatchObject({
    argv: [
      'setpriv',
      '--reuid=code',
      '--regid=code',
      '--clear-groups',
      '--',
      'bun',
      '/opt/nixie/main.ts',
    ],
    cwd: '/work',
  });
});

test('it copies each input file to the work folder and each skill to /skills', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    skills: [
      {
        name: 'pdf-forms',
        hash: 'sha256:skill1',
        files: new Map([
          ['SKILL.md', 'Fill the form.'],
          ['references/fields.md', 'name, date'],
        ]),
      },
    ],
  });

  await code.call({ skills: ['pdf-forms'] });

  const [created] = code.adapter.created;

  invariant(created);

  expect([...(code.adapter.files.get(created.id)?.keys() ?? [])].toSorted()).toStrictEqual([
    '/opt/nixie/main.py',
    '/skills/pdf-forms/SKILL.md',
    '/skills/pdf-forms/references/fields.md',
  ]);
});

test('it destroys the sandbox when the program ends', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  await code.call({});

  const created = code.adapter.created.map((sandbox) => sandbox.id);

  expect(code.adapter.destroyed).toStrictEqual(created);
});

test('it destroys the sandbox when its exec throws, and returns a tool error', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => {
      throw new Error('the guest broke');
    },
  });

  const result = await code.call({});

  expect(result).toStrictEqual(
    buildToolErrorResult(
      'nixie could not finish the code run in its sandbox. A second call starts a new one.',
    ),
  );

  const created = code.adapter.created.map((sandbox) => sandbox.id);

  expect(code.adapter.destroyed).toStrictEqual(created);
});

test('it destroys the sandbox and returns the call-time error when the call passes 120 s', async () => {
  const ctx = await setupTest();

  const code = ctx.start({ program: () => ({ until: new Promise(() => {}) }) });
  const running = code.call({});

  await waitForCondition(() => ctx.countStartedPrograms(code.adapter) === 1);

  ctx.clock.advance(120_000);

  const outcome = await running;

  expect(outcome).toStrictEqual(
    buildToolErrorResult('The code run took more than 120 s, so nixie stopped it.'),
  );

  const created = code.adapter.created.map((sandbox) => sandbox.id);

  expect(code.adapter.destroyed).toStrictEqual(created);
});

test('it retries a failed destroy every 60 s, and holds the slot until it succeeds', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    adapter: {
      destroyFailures: [
        { kind: 'reject', message: 'impd is down' },
        { kind: 'reject', message: 'impd is down' },
      ],
    },
  });

  await code.call({});
  await code.call({});

  const refused = await code.call({});

  ctx.clock.advance(60_000);

  await waitForCondition(() => code.adapter.destroyed.length === 2);
  await waitForCondition(() => ctx.probeAccepted(code.call));

  expect(refused).toStrictEqual(
    buildToolErrorResult(
      '2 code runs are in progress, which is the most at once. Call again when one has returned.',
    ),
  );
});

test('it counts a sandbox that a forget already destroyed as destroyed on the retry', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    adapter: {
      destroyFailures: [
        { kind: 'reject', message: 'impd is down' },
        { kind: 'reject', message: 'impd is down' },
      ],
    },
  });

  await code.call({});
  await code.call({});

  const created = code.adapter.created.map((sandbox) => sandbox.id);

  await Promise.all(
    created.map(async (id) => {
      await ctx.destroyBehind(code.adapter, id);
    }),
  );

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.probeAccepted(code.call));

  expect(code.adapter.destroyed.slice(0, 2)).toStrictEqual(created);
  expect(code.adapter.destroyed).toHaveLength(3);
});

test('it returns the wall-time limit when nixie stops a program at 60 s', async () => {
  const ctx = await setupTest();

  const code = ctx.start({ program: () => ({ isHanging: true, stdout: 'so far\n' }) });
  const running = code.call({});

  await waitForCondition(() => ctx.countStartedPrograms(code.adapter) === 1);

  ctx.clock.advance(60_000);

  const outcome = await running;

  expect(parseFencedResult(outcome)).toStrictEqual({
    ...ctx.okResult,
    exitCode: null,
    stdout: { text: 'so far\n', bytes: 7, isCut: false, file: null },
    limit: {
      kind: 'wall_time',
      sentence: 'The program ran past its limit of 60 s, so nixie stopped it.',
    },
  });
});

test('it returns the memory limit when the memory-kill count rose during the program', async () => {
  const ctx = await setupTest();

  const reads: MemoryKillRead[] = [
    { kind: 'count', kills: 0 },
    { kind: 'count', kills: 1 },
  ];

  const code = ctx.start({
    program: () => ({ code: null, signal: 'SIGKILL' }),
    adapter: { readMemoryKills: () => Promise.resolve(reads.shift() ?? { kind: 'failed' }) },
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({
    exitCode: null,
    limit: {
      kind: 'memory',
      sentence:
        'The program ran out of its 512 MiB of memory. For a large CSV, read it with duckdb.',
    },
  });
});

test('it returns the killed limit for a SIGKILL that nixie did not send when the count cannot be read', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ code: null, signal: 'SIGKILL' }),
    adapter: { readMemoryKills: () => Promise.resolve({ kind: 'unsupported' }) },
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({
    limit: {
      kind: 'killed',
      sentence:
        'The program was killed by `SIGKILL`, which nixie did not send. Running out of its 512 MiB of memory is one cause.',
    },
  });
});

test('it returns no limit for a SIGKILL when the memory-kill count did not rise', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ code: null, signal: 'SIGKILL' }),
    adapter: { readMemoryKills: () => Promise.resolve({ kind: 'count', kills: 3 }) },
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({ limit: null });
});

test('it returns the output limit, and keeps the stream as a file, when a stream passes 1 MiB', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({
      stdout: 'x'.repeat(50_000),
      stdoutTotal: 2 * 1024 * 1024,
      isStdoutCut: true,
    }),
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({
    stdout: {
      text: 'x'.repeat(32_768),
      bytes: 2_097_152,
      isCut: true,
      file: expect.stringMatching(/^[a-z][\da-z]{9}$/u),
    },
    limit: {
      kind: 'output',
      sentence: 'The program wrote more than 1 MiB to stdout, and nixie kept the first 1 MiB.',
    },
  });
});

test('it returns the files limit and no files when out/ holds more than 50 files', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({
      writes: Object.fromEntries(
        Array.from({ length: 51 }, (_, index) => [
          `out/f${String(index).padStart(2, '0')}.txt`,
          'a',
        ]),
      ),
    }),
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({
    files: [],
    limit: {
      kind: 'files',
      sentence:
        'The program wrote 51 files of 51 B under out/, past the limit of 50 files and 20 MiB, so nixie returned none.',
    },
  });
});

test('it returns the files limit when out/ holds more than 20 MiB', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ writes: { 'out/big.bin': new Uint8Array(20 * 1024 * 1024 + 1) } }),
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({
    files: [],
    limit: { kind: 'files' },
  });
});

test('it returns the files limit and no files when a file grew past 20 MiB after the listing', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ writes: { 'out/big.bin': 'a' } }),
    growAfterListing: { 'out/big.bin': new Uint8Array(21 * 1024 * 1024) },
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({ files: [], limit: { kind: 'files' } });
});

test('it returns the call-time error at 120 s when the sandbox destroy hangs', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ until: new Promise(() => {}) }),
    adapter: { destroyFailures: [{ kind: 'hang' }] },
  });

  const running = code.call({});

  await waitForCondition(() => ctx.countStartedPrograms(code.adapter) === 1);

  ctx.clock.advance(120_000);

  const outcome = await running;

  expect(outcome).toStrictEqual(
    buildToolErrorResult('The code run took more than 120 s, so nixie stopped it.'),
  );
});

test('it destroys its sandbox and runs nothing when a forget came during the create', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();

  const code = ctx.start({
    program: () => ({ writes: { 'out/a.txt': 'a' } }),
    adapter: { createFailures: [{ kind: 'wait', until: gate.promise }] },
  });

  const running = code.call({});

  await waitForCondition(() => ctx.readCallRecords().then((records) => records.length === 1));
  await makeCodeRunCleanup(ctx.log, code.adapter).destroyForThread('task-1');

  gate.resolve();

  const result = await running;
  const rows = await sql`select * from code_files`.execute(ctx.log.writer.db);

  const [created] = code.adapter.created;

  invariant(created);

  expect(result).toStrictEqual(
    buildToolErrorResult(
      'A forget ended this session during the code run, so nixie kept nothing from it.',
    ),
  );

  expect(code.adapter.destroyed).toStrictEqual([created.id]);
  expect(ctx.countStartedPrograms(code.adapter)).toBe(0);
  expect(rows.rows).toStrictEqual([]);
});

test('it returns the files limit when the listing of out/ passes the exec cap', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ writes: { 'out/a.txt': 'a', 'out/b.txt': 'b' } }),
    listingCutBytes: 6,
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({ files: [], limit: { kind: 'files' } });
});

test('it returns the output limit and no files when a program passes both output and files', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({
      stdout: 'x',
      stdoutTotal: 2 * 1024 * 1024,
      isStdoutCut: true,
      writes: Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [
          `out/f${String(index).padStart(2, '0')}.txt`,
          'a',
        ]),
      ),
    }),
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({
    files: [],
    limit: { kind: 'output' },
  });
});

test('it refuses a file ID that no code run wrote, before it creates a sandbox', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const result = await code.call({ files: [{ path: 'orders.csv', file: 'f8k2m4q9za' }] });

  expect(result).toStrictEqual(buildToolErrorResult('No file f8k2m4q9za belongs to this thread.'));
  expect(code.adapter.created).toStrictEqual([]);
});

test('it refuses a page that the session does not hold, before it creates a sandbox', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const result = await code.call(
    { files: [{ path: 'page.txt', page: 'tz4a98xxat' }] },
    { session: { key: 'session-a', invalidatedThrough: 0 } },
  );

  expect(result).toStrictEqual(
    buildToolErrorResult('No page tz4a98xxat is stored in this session.'),
  );

  expect(code.adapter.created).toStrictEqual([]);
});

test('it refuses a page for a call with no session, such as a worker call', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      fetchURL: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at nine.',
      links: [],
    },
    { sessionKey: 'run-1', thread: 'task-1', invalidatedThrough: null },
    { textBytes: 1000, linkPathChars: 24, storeBytes: 10_000 },
  );

  invariant(stored);

  const result = await code.call({ files: [{ path: 'page.txt', page: stored.pageID }] });

  expect(result).toStrictEqual(
    buildToolErrorResult(`No page ${stored.pageID} is stored in this session.`),
  );

  expect(code.adapter.created).toStrictEqual([]);
});

test('it copies the stored text of a page of the session into the work folder', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const stored = await writeWebFetchPage(
    ctx.log,
    {
      url: 'https://harbour.test/ferries',
      fetchURL: 'https://harbour.test/ferries',
      status: 200,
      contentType: 'text/html',
      isTruncated: false,
      blocked: null,
      text: 'Ferries leave at nine.',
      links: [],
    },
    { sessionKey: 'session-a', thread: 'task-1', invalidatedThrough: null },
    { textBytes: 1000, linkPathChars: 24, storeBytes: 10_000 },
  );

  invariant(stored);

  await code.call(
    { files: [{ path: 'page.txt', page: stored.pageID }] },
    { session: { key: 'session-a', invalidatedThrough: 0 } },
  );

  const [created] = code.adapter.created;

  invariant(created);

  const copied = code.adapter.files.get(created.id)?.get('/work/page.txt');

  expect(new TextDecoder().decode(copied)).toBe('Ferries leave at nine.');
});

test('it copies the current body of a note into the work folder as markdown', async () => {
  const ctx = await setupTest();

  const code = ctx.start({ notes: { n4w8k2c6rd: '## Boiler\nTrips after cold nights.' } });

  await code.call(
    { files: [{ path: 'zine.md', note: 'n4w8k2c6rd' }] },
    { tools: ['code.run', 'notebook.read'] },
  );

  const [created] = code.adapter.created;

  invariant(created);

  const copied = code.adapter.files.get(created.id)?.get('/work/zine.md');

  expect(new TextDecoder().decode(copied)).toBe('## Boiler\nTrips after cold nights.');
});

test('it copies a stored image from another thread into the work folder as stored', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

  await seedImage(ctx.log, { image: 'im4k9q2x7a', source: 'draw', bytes });

  const code = ctx.start();

  await code.call({ files: [{ path: 'in.png', image: 'im4k9q2x7a' }] });

  const [created] = code.adapter.created;

  invariant(created);

  expect(code.adapter.files.get(created.id)?.get('/work/in.png')).toStrictEqual(bytes);
});

test('it refuses a note file for a caller that does not hold notebook.read', async () => {
  const ctx = await setupTest();

  const code = ctx.start({ notes: { n4w8k2c6rd: 'Trips after cold nights.' } });

  const result = await code.call({ files: [{ path: 'zine.md', note: 'n4w8k2c6rd' }] });

  expect(result).toStrictEqual(
    buildToolErrorResult(
      'You cannot use the note n4w8k2c6rd as a file, because you do not hold notebook.read.',
    ),
  );

  expect(code.adapter.created).toStrictEqual([]);
});

test('it refuses an unknown or forgotten note, before it creates a sandbox', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const result = await code.call(
    { files: [{ path: 'zine.md', note: 'd8p3q1z6mw' }] },
    { tools: ['code.run', 'notebook.read'] },
  );

  expect(result).toStrictEqual(buildToolErrorResult('No note d8p3q1z6mw exists.'));
  expect(code.adapter.created).toStrictEqual([]);
});

test('it checks a note file after a file ID and before a page ID', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const noteFirst = await code.call(
    {
      files: [
        { path: 'page.txt', page: 'tz4a98xxat' },
        { path: 'zine.md', note: 'd8p3q1z6mw' },
      ],
    },
    { tools: ['code.run', 'notebook.read'] },
  );

  const fileFirst = await code.call(
    {
      files: [
        { path: 'zine.md', note: 'd8p3q1z6mw' },
        { path: 'orders.csv', file: 'f8k2m4q9za' },
      ],
    },
    { tools: ['code.run', 'notebook.read'] },
  );

  expect([noteFirst, fileFirst]).toStrictEqual([
    buildToolErrorResult('No note d8p3q1z6mw exists.'),
    buildToolErrorResult('No file f8k2m4q9za belongs to this thread.'),
  ]);
});

test('it refuses a skill that the calling task has not pinned, before it creates a sandbox', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const result = await code.call({ skills: ['pdf-forms'] });

  expect(result).toStrictEqual(buildToolErrorResult('No skill pdf-forms is on your skill list.'));
  expect(code.adapter.created).toStrictEqual([]);
});

test('it refuses inputs past 64 MiB, before it creates a sandbox', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    skills: [
      {
        name: 'big',
        hash: 'sha256:big',
        files: new Map([['data.txt', 'a'.repeat(64 * 1024 * 1024 + 1)]]),
      },
    ],
  });

  const result = await code.call({ skills: ['big'] });

  expect(result).toStrictEqual(
    buildToolErrorResult('The inputs come to 64.0 MiB, past the limit of 64 MiB.'),
  );

  expect(code.adapter.created).toStrictEqual([]);
});

test('it refuses a call when the sandbox fails to start, and starts a new one on the next call', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    adapter: { createFailures: [{ kind: 'reject', message: 'impd is down' }] },
  });

  const refused = await code.call({});
  const next = await code.call({});

  expect(refused).toStrictEqual(
    buildToolErrorResult('nixie could not start the code sandbox. A second call starts a new one.'),
  );

  expect(parseFencedResult(next)).toStrictEqual(ctx.okResult);
});

test('it refuses a third code run while two are in progress, and creates nothing for it', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();
  const code = ctx.start({ program: () => ({ until: gate.promise }) });
  const first = code.call({});
  const second = code.call({});

  await waitForCondition(() => ctx.countStartedPrograms(code.adapter) === 2);

  const third = await code.call({});

  gate.resolve();

  await Promise.all([first, second]);

  expect(third).toStrictEqual(
    buildToolErrorResult(
      '2 code runs are in progress, which is the most at once. Call again when one has returned.',
    ),
  );

  expect(code.adapter.created).toHaveLength(2);
});

test('it refuses an input path that is under out/, before it creates a sandbox', async () => {
  const ctx = await setupTest();

  const code = ctx.start();

  const result = await code.call({ files: [{ path: 'out/a.csv', file: 'f8k2m4q9za' }] });

  expect(result.isError).toBe(true);
  expect(code.adapter.created).toStrictEqual([]);
});

test('it seals the files a program wrote as attachments of the result record, with one row each', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({
      writes: { 'out/b.txt': 'second', 'out/a.csv': 'first', 'data.tmp': 'not returned' },
    }),
  });

  const result = await code.call({});
  const [stored] = await ctx.readResultRecords();

  invariant(stored);

  const attachments = await readRecordAttachments(ctx.log, [stored.record.sequence]);
  const rows = await sql`select * from code_files order by position`.execute(ctx.log.writer.db);

  expect(parseFencedResult(result)).toMatchObject({
    files: [
      { path: 'out/a.csv', bytes: 5, mediaType: 'text/csv', isShown: false },
      { path: 'out/b.txt', bytes: 6, mediaType: 'text/plain', isShown: false },
    ],
  });

  expect(attachments.get(stored.record.sequence)).toStrictEqual({
    status: 'readable',
    attachments: [new TextEncoder().encode('first'), new TextEncoder().encode('second')],
  });

  expect(rows.rows).toStrictEqual([
    {
      file_id: expect.any(String),
      thread: 'task-1',
      sequence: stored.record.sequence,
      position: 0,
      bytes: 5,
      media_type: 'text/csv',
    },
    {
      file_id: expect.any(String),
      thread: 'task-1',
      sequence: stored.record.sequence,
      position: 1,
      bytes: 6,
      media_type: 'text/plain',
    },
  ]);
});

test('it keeps the file bytes out of the result record text and holds the sandbox ID and skills beside it', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({ writes: { 'out/a.txt': 'secret bytes' } }),
    skills: [{ name: 'pdf-forms', hash: 'sha256:skill1', files: new Map([['SKILL.md', 'x']]) }],
  });

  await code.call({ skills: ['pdf-forms'] });

  const [stored] = await ctx.readResultRecords();

  expect(JSON.stringify(stored?.record.erasable)).not.toContain('secret bytes');

  expect(stored?.record.erasable).toMatchObject({
    status: 'readable',
    fields: {
      hidden: {
        sandbox: code.adapter.created[0]?.id,
        skills: [{ name: 'pdf-forms', hash: 'sha256:skill1' }],
      },
    },
  });
});

test('it reads a file by its ID in a later code run on the same thread', async () => {
  const ctx = await setupTest();

  const code = ctx.start({ program: () => ({ writes: { 'out/a.csv': 'x,y\n1,2\n' } }) });

  const first = await code.call({});

  const fileID = readCodeRunFiles(first)[0]?.file;

  invariant(fileID !== undefined);

  await code.call({ files: [{ path: 'in/a.csv', file: fileID }] });

  const [, second] = code.adapter.created;

  invariant(second);

  expect(new TextDecoder().decode(code.adapter.files.get(second.id)?.get('/work/in/a.csv'))).toBe(
    'x,y\n1,2\n',
  );
});

test('it refuses a file of another thread', async () => {
  const ctx = await setupTest();

  const code = ctx.start({ program: () => ({ writes: { 'out/a.csv': 'x' } }) });

  const first = await code.call({});

  const fileID = readCodeRunFiles(first)[0]?.file;

  invariant(fileID !== undefined);

  const result = await code.call(
    { files: [{ path: 'a.csv', file: fileID }] },
    { thread: 'task-2' },
  );

  expect(result).toStrictEqual(buildToolErrorResult(`No file ${fileID} belongs to this thread.`));
});

test('it refuses a file whose result record a forget made unreadable', async () => {
  const ctx = await setupTest();

  const code = ctx.start({ program: () => ({ writes: { 'out/a.csv': 'x' } }) });

  const first = await code.call({});

  const fileID = readCodeRunFiles(first)[0]?.file;

  invariant(fileID !== undefined);

  const [stored] = await ctx.readResultRecords();

  invariant(stored);

  const row = await ctx.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', stored.record.sequence)
    .executeTakeFirst();

  invariant(typeof row?.key_id === 'string');

  await removeRecordKey(ctx.log, row.key_id);

  const result = await code.call({ files: [{ path: 'a.csv', file: fileID }] });

  expect(result).toStrictEqual(buildToolErrorResult(`The file ${fileID} was forgotten.`));
});

test('it shows up to 4 image files to the model, each through the session reservation', async () => {
  const ctx = await setupTest();
  const encoded = await encodeTestImage({ width: 8, height: 8 }, 'png');

  const png = new Uint8Array(encoded);

  const reserved: (readonly ToolImage[])[] = [];

  const code = ctx.start({
    program: () => ({
      writes: Object.fromEntries(
        Array.from({ length: 5 }, (_, index) => [`out/chart${String(index)}.png`, png]),
      ),
    }),
  });

  const result = await code.call(
    {},
    {
      session: {
        key: 'session-a',
        invalidatedThrough: 0,
        reserveImages: (images) => {
          reserved.push(images);

          return true;
        },
      },
    },
  );

  expect(reserved).toHaveLength(4);
  expect(result.content.filter((block) => block.type === 'image')).toHaveLength(4);

  expect(readCodeRunFiles(result).map((file) => file.isShown)).toStrictEqual([
    true,
    true,
    true,
    true,
    false,
  ]);
});

test('it shows no image when the session refuses its reservation', async () => {
  const ctx = await setupTest();
  const encoded = await encodeTestImage({ width: 8, height: 8 }, 'png');

  const png = new Uint8Array(encoded);

  const code = ctx.start({
    program: () => ({ writes: { 'out/chart.png': png } }),
  });

  const result = await code.call(
    {},
    { session: { key: 'session-a', invalidatedThrough: 0, reserveImages: () => false } },
  );

  expect(parseFencedResult(result)).toMatchObject({
    files: [{ path: 'out/chart.png', mediaType: 'image/png', isShown: false }],
  });
});

test('it shows no image for a call with no session', async () => {
  const ctx = await setupTest();
  const encoded = await encodeTestImage({ width: 8, height: 8 }, 'png');

  const png = new Uint8Array(encoded);

  const code = ctx.start({
    program: () => ({ writes: { 'out/chart.png': png } }),
  });

  const result = await code.call({});

  expect(parseFencedResult(result)).toMatchObject({ files: [{ isShown: false }] });
});

test('it returns a stream past 32 KiB as a file that counts toward neither files limit', async () => {
  const ctx = await setupTest();

  const code = ctx.start({
    program: () => ({
      stdout: 'y'.repeat(40_000),
      writes: Object.fromEntries(
        Array.from({ length: 50 }, (_, index) => [
          `out/f${String(index).padStart(2, '0')}.txt`,
          'a',
        ]),
      ),
    }),
  });

  const result = await code.call({});
  const [stored] = await ctx.readResultRecords();

  invariant(stored);

  const attachments = await readRecordAttachments(ctx.log, [stored.record.sequence]);

  expect(parseFencedResult(result)).toMatchObject({
    stdout: { bytes: 40_000, file: expect.stringMatching(/^[a-z][\da-z]{9}$/u) },
    limit: null,
  });

  const read = attachments.get(stored.record.sequence);

  invariant(read?.status === 'readable');

  expect(read.attachments).toHaveLength(51);
});

test('it keeps nothing and returns the session-ended error when a forget ended the session during the run', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();

  const code = ctx.start({
    program: () => ({ writes: { 'out/a.txt': 'a' }, until: gate.promise }),
  });

  const running = code.call({}, { session: { key: 'session-a', invalidatedThrough: 0 } });

  await waitForCondition(() => ctx.countStartedPrograms(code.adapter) === 1);

  await writeRecords(ctx.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      payload: { itemID: '00000000-0000-4000-8000-000000000001' },
    },
  ]);

  gate.resolve();

  const result = await running;
  const rows = await sql`select * from code_files`.execute(ctx.log.writer.db);
  const [stored] = await ctx.readResultRecords();

  invariant(stored);

  const attachments = await readRecordAttachments(ctx.log, [stored.record.sequence]);

  expect(result).toStrictEqual(
    buildToolErrorResult(
      'A forget ended this session during the code run, so nixie kept nothing from it.',
    ),
  );

  expect(rows.rows).toStrictEqual([]);
  expect(attachments.get(stored.record.sequence)).toStrictEqual({ status: 'none' });
});

test('it ends with a tool error and writes no file when a forget destroys the sandbox of a running call', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();

  const code = ctx.start({
    program: () => ({ writes: { 'out/a.txt': 'a' }, until: gate.promise }),
  });

  const running = code.call({});

  await waitForCondition(() => ctx.countStartedPrograms(code.adapter) === 1);

  const [created] = code.adapter.created;

  invariant(created);

  const sandbox = await code.adapter.read(created.id);

  await sandbox?.destroy();

  gate.resolve();

  const result = await running;
  const rows = await sql`select * from code_files`.execute(ctx.log.writer.db);

  expect(result.isError).toBe(true);
  expect(rows.rows).toStrictEqual([]);
  expect(code.adapter.destroyed).toStrictEqual([created.id, created.id]);
});

test('it frees the slot after a forget destroyed the sandbox and the call destroyed it again', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();
  const code = ctx.start({ program: () => ({ until: gate.promise }) });
  const first = code.call({});
  const second = code.call({});

  await waitForCondition(() => ctx.countStartedPrograms(code.adapter) === 2);

  const [created] = code.adapter.created;

  invariant(created);

  await ctx.destroyBehind(code.adapter, created.id);

  gate.resolve();

  await Promise.all([first, second]);

  const third = await code.call({});
  const fourth = await code.call({});

  expect(third.isError).not.toBe(true);
  expect(fourth.isError).not.toBe(true);
});
