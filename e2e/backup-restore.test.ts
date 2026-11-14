import { expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pendingRestoreSchema } from '@heynixie/log';
import {
  createTestClient,
  runHostCommand,
  sendClientMessage,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';

test('it backs up a running server and restores it into an empty data directory through the nixie executable, and the restarted server refuses to start on the finished restore', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  nixie.model.addReplies({ text: 'Quince-reply-4ZT9' });

  // The turn starts the real SDK in a guest process, which outlasts the helper's default wait on
  // a busy host.
  await sendClientMessage(api.client, { text: 'Plum-message-7QK2' }, 'Quince-reply-4ZT9', {
    timeoutMs: 30_000,
  });

  const target = join(nixie.directory, 'backup');

  const backup = await runHostCommand(nixie.configPath, ['backup', '--to', target]);

  await server.sendStopSignal();
  await server.waitForExit();

  await rm(nixie.dataDir, { recursive: true, force: true });
  await mkdir(nixie.dataDir);

  const restore = await runHostCommand(nixie.configPath, ['restore', '--from', target, '--yes']);

  const restarted = nixie.harness.start();

  const exit = await restarted.exited;
  const marker = await Bun.file(join(nixie.dataDir, 'restore-incomplete')).text();

  expect(backup.exitCode).toBe(0);
  expect(backup.stdout).toStartWith('copied nixie.db\ncopied keys.db\n');
  expect(backup.stdout).toInclude(`nixie backed up nixie.db and keys.db into ${target} in `);
  expect(restore.exitCode).toBe(0);
  expect(restore.stdout).toInclude(`nixie restored nixie.db and keys.db from ${target}\n`);
  expect(pendingRestoreSchema.safeParse(JSON.parse(marker)).success).toBeTrue();
  expect(exit.code).not.toBe(0);
  expect(restarted.readOutput()).not.toInclude('"event":"ready"');
  expect(restarted.readOutput()).toInclude('holds a finished restore');
});
