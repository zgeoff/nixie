import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHostResponder } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import type { RuleEntry } from '@heynixie/policy';
import { logExportDeclaration } from '@heynixie/policy';
import { buildRuleEntry, buildTestDecisionPoint } from '@heynixie/policy/test-utils';
import { startControlSocket } from '../part/start-control-socket';
import { writeBootFiles } from '../test-utils/write-boot-files';
import { buildAPIGate } from '../utils/build-api-gate';
import { runCLI } from './run-cli';

async function setupTest(rules: readonly RuleEntry[] = []) {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-export-command-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const files = await writeBootFiles(directory, 'http://127.0.0.1:9', { config: [], secrets: [] });
  const api = await startTestAPI();

  const decisions = buildTestDecisionPoint({
    declaration: logExportDeclaration,
    rules,
  });

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      readBackups: () => null,
      decide: decisions.decide,
      runInForceSeed: () => Promise.resolve(),
      readDefinitions: () => null,
      readInForce: () => null,
      wakeExports: () => {},
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
      runConversationReset: () => Promise.reject(new Error('no reset runs in this test')),
      gate: buildAPIGate(),
    }),
  });

  onTestFinished(() => socket.stop());

  const io = {
    log: mock(),
    print: mock(),
    waitForSignal: () => Promise.withResolvers<string>().promise,
  };

  return {
    ...api,
    io,
    path: join(directory, 'export.db'),
    runExport: (path: string) => runCLI(['export', path, '--config', files.configPath], io),
  };
}

test('it writes a file that the sqlite3 command opens, with each text decrypted', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'hello' },
    },
  ]);

  const exitCode = await ctx.runExport(ctx.path);

  const read = Bun.spawnSync([
    'sqlite3',
    '-readonly',
    ctx.path,
    'select sequence, kind, thread, text from records',
  ]);

  expect(exitCode).toBe(0);
  expect(read.stdout.toString()).toBe('1|owner_message|conversation|{"text":"hello"}\n');
});

test('it leaves a forgotten text as a gap and still finishes', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'gone' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'kept' },
    },
  ]);

  await removeTestRecordKey(ctx.context.log, 1);

  const exitCode = await ctx.runExport(ctx.path);

  const read = Bun.spawnSync([
    'sqlite3',
    '-readonly',
    ctx.path,
    "select sequence, ifnull(text, 'GAP'), text_status from records order by sequence",
  ]);

  expect(exitCode).toBe(0);
  expect(read.stdout.toString()).toBe('1|GAP|shredded\n2|{"text":"kept"}|readable\n');
});

test('it writes no file and exits 1 when a deny rule covers the export', async () => {
  const ctx = await setupTest([
    buildRuleEntry('no-export', { outcome: 'deny', effects: ['export'] }),
  ]);

  const exitCode = await ctx.runExport(ctx.path);

  expect(exitCode).toBe(1);

  const exists = await Bun.file(ctx.path).exists();

  expect(exists).toBe(false);

  expect(ctx.io.log).toHaveBeenCalledWith(
    'command.failed',
    expect.objectContaining({
      command: 'export',
      message: expect.stringContaining('403'),
    }),
  );
});

test('it makes a file that only its owner reads', async () => {
  const ctx = await setupTest();

  await ctx.runExport(ctx.path);

  const info = await stat(ctx.path);

  expect(info.mode & 0o777).toBe(0o600);
});

test('it refuses a path that exists and leaves the file as it was', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, 'precious');

  const exitCode = await ctx.runExport(ctx.path);

  expect(exitCode).toBe(1);

  const text = await Bun.file(ctx.path).text();

  expect(text).toBe('precious');
});

test('it exits 2 with no path', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['export'], ctx.io);

  expect(exitCode).toBe(2);
});
