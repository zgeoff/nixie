import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { startWriter } from '@heynixie/log';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { runCLI } from './run-cli';
import { createTestClient } from './test-utils/create-test-client';
import { sendClientMessage } from './test-utils/send-client-message';
import { startTestNixie } from './test-utils/start-test-nixie';
import { writeBootFiles } from './test-utils/write-boot-files';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-backup-cli-'));

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

test('it backs up the data of a running server into the directory it names, and prints each copy', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const writer = await startWriter({ dataDir: files.dataDir });

  onTestFinished(() => writer.stop());

  const target = join(ctx.directory, 'backup');

  const exitCode = await runCLI(['backup', '--to', target, '--config', files.configPath], ctx.io);
  const copies = await readdir(target);

  expect(exitCode).toBe(0);

  expect(ctx.io.print.mock.calls).toStrictEqual([
    ['copied nixie.db'],
    ['copied keys.db'],
    [`nixie backed up nixie.db and keys.db into ${target} in 1 copy`],
  ]);

  expect(copies).toIncludeSameMembers(['nixie.db', 'keys.db']);
});

test('it restores the backup of a running server into an empty data directory, and the restarted server reads its messages with the deployment key', async () => {
  const ctx = await setupTest();
  const nixie = await startTestNixie();
  const api = await createTestClient(nixie);

  nixie.model.addReplies({ text: 'Quince-reply-4ZT9' });

  await sendClientMessage(api.client, { text: 'Plum-message-7QK2' }, 'Quince-reply-4ZT9');

  const target = join(ctx.directory, 'backup');

  await runCLI(['backup', '--to', target, '--config', nixie.configPath], ctx.io);

  nixie.sendSignal('SIGTERM');

  await nixie.waitForExit();

  await rm(nixie.dataDir, { recursive: true, force: true });
  await mkdir(nixie.dataDir);

  ctx.io.print.mockClear();

  const exitCode = await runCLI(
    ['restore', '--from', target, '--yes', '--config', nixie.configPath],
    ctx.io,
  );

  const restarted = nixie.startAgain();

  const listening = await restarted.waitForLogEvent('http.listening');

  await restarted.waitForLogEvent('ready');

  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `http://127.0.0.1:${String(listening['port'])}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${api.token}` },
    }),
  );

  const page = await client.conversation.read({ thread: 'conversation' });

  expect(exitCode).toBe(0);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    `nixie restored nixie.db and keys.db from ${target}`,
  );

  expect(page.records.map((record) => record.message?.text)).toIncludeAllMembers([
    'Plum-message-7QK2',
    'Quince-reply-4ZT9',
  ]);
}, 60_000);

test('it refuses a restore while a server runs on the data directory', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const writer = await startWriter({ dataDir: files.dataDir });

  onTestFinished(() => writer.stop());

  const target = join(ctx.directory, 'backup');

  await mkdir(target);

  const exitCode = await runCLI(
    ['restore', '--from', target, '--yes', '--config', files.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(1);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie restore runs only while the server is stopped, and another nixie process holds the data directory',
  );
});

test('it refuses a restore without --yes, and says the data written since the backup is lost', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:9', {
    config: [],
    secrets: [],
  });

  const exitCode = await runCLI(
    ['restore', '--from', '/backup/nixie', '--config', files.configPath],
    ctx.io,
  );

  expect(exitCode).toBe(2);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    'A restore replaces nixie.db and keys.db in the data directory with the backup, and the data written since the backup is lost.\nRun nixie restore --from /backup/nixie --yes to restore.',
  );
});

test('it refuses a restore that names no directory', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['restore', '--yes'], ctx.io);

  expect(exitCode).toBe(2);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie restore takes --from <directory>, a directory that nixie backup wrote',
  );
});

test('it refuses a backup that names no directory', async () => {
  const ctx = await setupTest();
  const exitCode = await runCLI(['backup'], ctx.io);

  expect(exitCode).toBe(2);

  expect(ctx.io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie backup takes --to <directory>, a new directory to copy the data into',
  );
});
