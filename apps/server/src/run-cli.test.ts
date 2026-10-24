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

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    io: {
      log: mock(),
      print: mock(),
      waitForSignal: () => Promise.withResolvers<string>().promise,
    },
  };
}

test('it refuses a reset without --keep-sessions, and says backups still hold the old data', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(['reset', '--yes', '--config', files.configPath], ctx.io);

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

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(['reset', '--keep-sessions', '--config', files.configPath], ctx.io);

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

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const api = await startTestAPI();

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () =>
        Promise.resolve({
          resetAt: new Date('2026-10-14T09:30:00.000Z'),
          lastSequence: 412,
          keptSessions: 2,
        }),
      runConversationReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  const exitCode = await runCLI(
    ['reset', '--keep-sessions', '--yes', '--config', files.configPath],
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

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const api = await startTestAPI();

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () => Promise.reject(new Error('the runtime refused the destroy')),
      runConversationReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  const exitCode = await runCLI(
    ['reset', '--keep-sessions', '--yes', '--config', files.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(1);

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith('command.failed', {
    command: 'reset',
    error: 'Error',
    message: 'nixie answered the reset request with 500: the runtime refused the destroy',
  });
});

test('it refuses a reset of the memories without --yes, and says what it keeps', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(
    ['reset', '--only', 'memories', '--config', files.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(2);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      [
        'A reset of the memories forgets every memory item, and keeps every record, the conversation and the device sessions.',
        'Only a restore from a backup undoes it.',
        'Backups from before the reset still hold the old data until they age out.',
        'Run nixie reset --only memories --yes to reset.',
      ].join('\n'),
    ],
  ]);
});

test('it refuses a reset of the conversations without --yes, and says what it keeps', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(
    ['reset', '--only', 'conversations', '--config', files.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(2);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      [
        'A reset of the conversations forgets every message of the conversation, destroys its sandbox and gives the model a new session, and keeps every record, every memory item and the device sessions.',
        'Only a restore from a backup undoes it.',
        'Backups from before the reset still hold the old data until they age out.',
        'Run nixie reset --only conversations --yes to reset.',
      ].join('\n'),
    ],
  ]);
});

test('it prints what a reset of the conversations shredded, and that the server restarts', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const api = await startTestAPI();

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () => Promise.reject(new Error('no full reset runs in this test')),
      runConversationReset: () =>
        Promise.resolve({
          resetAt: new Date('2026-10-20T07:45:00.000Z'),
          lastSequence: 88,
          shreddedRecords: 14,
        }),
    }),
  });

  onTestFinished(() => socket.stop());

  const exitCode = await runCLI(
    ['reset', '--only', 'conversations', '--yes', '--config', files.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(0);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      [
        'nixie shredded 14 records of the conversation up to sequence 88 at 2026-10-20T07:45:00.000Z.',
        'The server restarts now, and its next turn starts with no history.',
        'Backups from before the reset still hold the old data until they age out.',
      ].join('\n'),
    ],
  ]);
});

test('it forgets every memory item through a reset of the memories, and prints how many', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const api = await startTestAPI();
  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => memory.store,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () => Promise.reject(new Error('no full reset runs in this test')),
      runConversationReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  const items = await Promise.all(
    ['Sings in a choir', 'Grows chillies on the balcony'].map((text) =>
      memory.store.remember({
        text,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const exitCode = await runCLI(
    ['reset', '--only', 'memories', '--yes', '--config', files.configPath],
    ctx.io,
  );

  const histories = await Promise.all(items.map((item) => memory.store.readHistory(item.itemID)));

  expect(exitCode).toBe(0);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    [
      [
        'nixie forgot 2 memory items.',
        'Backups from before the reset still hold the old data until they age out.',
      ].join('\n'),
    ],
  ]);

  expect(histories.map((history) => history?.state)).toStrictEqual(['forgotten', 'forgotten']);
});

test('it exits 2 on a command nixie does not have, and names the commands it takes', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(['frobnicate', '--config', files.configPath], ctx.io);

  expect(exitCode).toBe(2);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^nixie has no command frobnicate; it takes serve, check-encoder, /u),
  );
});

test('it exits 1 on a flag nixie does not take, before the command runs', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(['reset', '--frobnicate', '--config', files.configPath], ctx.io);

  expect(exitCode).toBe(1);
  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith('nixie: Unknown option: --frobnicate');
});

test('it exits 1 from check-encoder when the encoder folder holds no model', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(['check-encoder', '--encoder', files.dataDir], ctx.io);

  expect(exitCode).toBe(1);

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith(
    'command.failed',
    expect.objectContaining({ command: 'check-encoder' }),
  );
});

test('it pins a self-note from memory-pin', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const api = await startTestAPI();
  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => memory.store,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
      runConversationReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  const item = await memory.store.remember({
    text: 'Enjoys a slow morning question more than a quick one',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const exitCode = await runCLI(['memory-pin', item.itemID, '--config', files.configPath], ctx.io);
  const core = await memory.store.readPinnedCore();

  expect(exitCode).toBe(0);
  expect(core).toMatchObject([{ itemID: item.itemID, subject: 'self' }]);
});

test('it prints the subject of a self-note from memory-show', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const api = await startTestAPI();
  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => memory.store,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
      runConversationReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  const item = await memory.store.remember({
    text: 'Enjoys a slow morning question more than a quick one',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const exitCode = await runCLI(['memory-show', item.itemID, '--config', files.configPath], ctx.io);

  expect(exitCode).toBe(0);

  expect(JSON.parse(String(ctx.io.print.mock.calls[0]?.[0]))).toMatchObject({
    itemID: item.itemID,
    subject: 'self',
    state: 'active',
  });
});

test('it prints the count of each subject from memory-subjects', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const api = await startTestAPI();
  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => memory.store,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
      runConversationReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  await memory.store.remember({
    text: 'The owner and the assistant call the boat the Soggy Biscuit',
    subject: 'shared',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const exitCode = await runCLI(['memory-subjects', '--config', files.configPath], ctx.io);

  expect(exitCode).toBe(0);

  expect(JSON.parse(String(ctx.io.print.mock.calls[0]?.[0]))).toStrictEqual({
    items: { owner: 0, shared: 1, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it prints the dry run of the subjects migration on a copy of the database file it names', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const path = join(files.dataDir, 'backup.db');
  const db = startDatabase(path);

  onTestFinished(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: files.dataDir });

  const exitCode = await runCLI(
    ['memory-subjects', '--dry-run', '--database', path, '--config', files.configPath],
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

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(
    ['memory-subjects', '--dry-run', '--config', files.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(2);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie memory-subjects --dry-run takes --database <path> of a nixie.db to copy',
  );
});
