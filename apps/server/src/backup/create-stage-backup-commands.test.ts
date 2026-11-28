import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostBackups } from '@heynixie/api';
import { makeHostResponder } from '@heynixie/api';
import { seedPublishedBackupSet, startTestAPI } from '@heynixie/api/test-utils';
import { startBackupSchedule } from '@heynixie/backup';
import { localDataStorage } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { runCLI } from '../cli/run-cli';
import { startControlSocket } from '../part/start-control-socket';
import { writeBootFiles } from '../test-utils/write-boot-files';
import { buildAPIGate } from '../utils/build-api-gate';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-stage-backup-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const files = await writeBootFiles(directory, 'http://127.0.0.1:9', { config: [], secrets: [] });
  const api = await startTestAPI();

  const holder: { backups: HostBackups | null } = { backups: null };
  const onPass = mock();

  const startSchedule = () => {
    const schedule = startBackupSchedule({
      context: { writer: api.writer, storage: localDataStorage },
      intervalMs: Number.MAX_SAFE_INTEGER,
      onAbandoned: () => {},
      onPass: () => {
        onPass();
      },
      onError: () => {},
    });

    onTestFinished(() => schedule.stop());

    holder.backups = { state: 'on', schedule };
  };

  const socket = await startControlSocket({
    path: join(files.dataDir, 'run', 'control.sock'),
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      readBackups: () => holder.backups,
      decide: buildAllowingDecisionPoint(),
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
    holder,
    onPass,
    startSchedule,
    runStageBackup: () => runCLI(['stage-backup', '--config', files.configPath], io),
  };
}

test('it stages a set and prints its sequence and kind', async () => {
  const ctx = await setupTest();

  await seedPublishedBackupSet(ctx.writer, { sequence: 1, logHead: 0 });

  ctx.startSchedule();

  const exitCode = await ctx.runStageBackup();

  expect(exitCode).toBe(0);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    "nixie staged backup set 2 (scheduled); the backup job's next run ships it",
  );
});

test('it exits 1 with the waiting set when a set waits for the backup job', async () => {
  const ctx = await setupTest();

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  const exitCode = await ctx.runStageBackup();

  expect(exitCode).toBe(1);
  expect(ctx.io.print).not.toHaveBeenCalled();

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith('command.failed', {
    command: 'stage-backup',
    error: 'Error',
    message:
      'nixie answered the backups stage request with 409: backup set 1 is staged and the backup job has not shipped it yet, so nixie stages no other set; run the backup job, then try again',
  });
});

test('it exits 1 when backups are off', async () => {
  const ctx = await setupTest();

  ctx.holder.backups = { state: 'off' };

  const exitCode = await ctx.runStageBackup();

  expect(exitCode).toBe(1);

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith('command.failed', {
    command: 'stage-backup',
    error: 'Error',
    message:
      "nixie answered the backups stage request with 409: backups are off in nixie's configuration, so nixie stages no set",
  });
});

test('it exits 1 before the backups part has started', async () => {
  const ctx = await setupTest();
  const exitCode = await ctx.runStageBackup();

  expect(exitCode).toBe(1);

  expect(ctx.io.log).toHaveBeenCalledExactlyOnceWith('command.failed', {
    command: 'stage-backup',
    error: 'Error',
    message:
      'nixie answered the backups stage request with 503: nixie has not started its backups yet; try again in a moment',
  });
});
