import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHostResponder } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { nixieSchema, runMigrations, startDatabase } from '@heynixie/db';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { runCLI } from './run-cli';
import { startControlSocket } from './start-control-socket';
import { writeBootFiles } from './test-utils/write-boot-files';

// the boot files a host command reads its data directory from, and the IO it prints and logs to;
// no model answers, because no host command starts a server
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const files = await writeBootFiles(directory, 'http://127.0.0.1:9', { config: [], secrets: [] });

  return {
    ...files,
    socketPath: join(files.dataDir, 'run', 'control.sock'),
    io: {
      log: mock(),
      print: mock(),
      waitForSignal: () => Promise.withResolvers<string>().promise,
    },
  };
}

test('it refuses a reset without --keep-sessions, and says backups still hold the old data', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['reset', '--yes', '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(2);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      [
        'nixie reset runs only with --keep-sessions, which keeps every device that is signed in now signed in.',
        'A reset removes every record, every memory, the conversation and every sandbox, and keeps the device sessions that are signed in now.',
        'Only a restore from a backup undoes it.',
        'Backups from before the reset still hold the old data until they age out.',
      ].join('\n'),
    ],
  ]);
});

test('it refuses a reset without --yes, and says backups still hold the old data', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['reset', '--keep-sessions', '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(2);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      [
        'A reset removes every record, every memory, the conversation and every sandbox, and keeps the device sessions that are signed in now.',
        'Only a restore from a backup undoes it.',
        'Backups from before the reset still hold the old data until they age out.',
        'Run nixie reset --keep-sessions --yes to reset.',
      ].join('\n'),
    ],
  ]);
});

test('it prints what the server reset, and that backups still hold the old data', async () => {
  const ctx = await setupTest();
  const api = await startTestAPI();

  const socket = await startControlSocket({
    path: ctx.socketPath,
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      runReset: () =>
        Promise.resolve({
          resetAt: new Date('2026-10-14T09:30:00.000Z'),
          lastSequence: 412,
          keptSessions: 2,
        }),
    }),
  });

  onTestFinished(() => socket.stop());

  const exitCode = await runCLI(
    ['reset', '--keep-sessions', '--yes', '--config', ctx.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(0);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      [
        'nixie removed the log up to sequence 412 at 2026-10-14T09:30:00.000Z and kept 2 device sessions signed in.',
        'The server restarts now, and its next turn starts with no history.',
        'Backups from before the reset still hold the old data until they age out.',
      ].join('\n'),
    ],
  ]);
});

test('it exits 1 when the server fails the reset', async () => {
  const ctx = await setupTest();
  const api = await startTestAPI();

  const socket = await startControlSocket({
    path: ctx.socketPath,
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      runReset: () => Promise.reject(new Error('the runtime refused the destroy')),
    }),
  });

  onTestFinished(() => socket.stop());

  const exitCode = await runCLI(
    ['reset', '--keep-sessions', '--yes', '--config', ctx.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(1);

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith('command.failed', {
    command: 'reset',
    error: 'Error',
    message: 'nixie answered the reset request with 500: the runtime refused the destroy',
  });
});

test('it exits 2 on a command nixie does not have, and names the commands it takes', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['frobnicate', '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(2);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^nixie has no command frobnicate; it takes serve, check-encoder, /u),
  );
});

test('it exits 1 on a flag nixie does not take, before the command runs', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['reset', '--frobnicate', '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(1);
  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith('nixie: Unknown option: --frobnicate');
});

test('it exits 1 from check-encoder when the encoder folder holds no model', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['check-encoder', '--encoder', ctx.dataDir], ctx.io);

  expect(exitCode).toBe(1);

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith(
    'command.failed',
    expect.objectContaining({ command: 'check-encoder' }),
  );
});

test('it pins a self-note from memory-pin', async () => {
  const ctx = await setupTest();
  const api = await startTestAPI();
  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: ctx.socketPath,
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => memory.store,
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  const item = await memory.store.remember({
    text: 'Enjoys a slow morning question more than a quick one',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const exitCode = await runCLI(['memory-pin', item.itemID, '--config', ctx.configPath], ctx.io);
  const core = await memory.store.readPinnedCore();

  expect(exitCode).toBe(0);
  expect(core).toMatchObject([{ itemID: item.itemID, subject: 'self' }]);
}, 15_000);

test('it prints the subject of a self-note from memory-show', async () => {
  const ctx = await setupTest();
  const api = await startTestAPI();
  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: ctx.socketPath,
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => memory.store,
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  const item = await memory.store.remember({
    text: 'Enjoys a slow morning question more than a quick one',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const exitCode = await runCLI(['memory-show', item.itemID, '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(0);

  expect(JSON.parse(String(ctx.io.print.mock.calls[0]?.[0]))).toMatchObject({
    itemID: item.itemID,
    subject: 'self',
    state: 'active',
  });
});

test('it prints the count of each subject from memory-subjects', async () => {
  const ctx = await setupTest();
  const api = await startTestAPI();
  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: ctx.socketPath,
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => memory.store,
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  await memory.store.remember({
    text: 'The owner and the assistant call the boat the Soggy Biscuit',
    subject: 'shared',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const exitCode = await runCLI(['memory-subjects', '--config', ctx.configPath], ctx.io);

  expect(exitCode).toBe(0);

  expect(JSON.parse(String(ctx.io.print.mock.calls[0]?.[0]))).toStrictEqual({
    items: { owner: 0, shared: 1, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it prints the dry run of the subjects migration on a copy of the database file it names', async () => {
  const ctx = await setupTest();

  const path = join(ctx.dataDir, 'backup.db');
  const db = startDatabase(path);

  onTestFinished(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: ctx.dataDir });

  const exitCode = await runCLI(
    ['memory-subjects', '--dry-run', '--database', path, '--config', ctx.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(0);

  expect(JSON.parse(String(ctx.io.print.mock.calls[0]?.[0]))).toStrictEqual({
    from: nixieSchema.migrations.length,
    to: nixieSchema.migrations.length,
    before: {
      items: { owner: 0, shared: 0, self: 0 },
      proposals: { owner: 0, shared: 0, self: 0 },
    },
    after: { items: { owner: 0, shared: 0, self: 0 }, proposals: { owner: 0, shared: 0, self: 0 } },
  });
});

test('it refuses a dry run of memory-subjects that names no database', async () => {
  const ctx = await setupTest();

  const exitCode = await runCLI(
    ['memory-subjects', '--dry-run', '--config', ctx.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(2);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie memory-subjects --dry-run takes --database <path> of a nixie.db to copy',
  );
});
