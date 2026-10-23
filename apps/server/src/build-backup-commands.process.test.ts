import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { waitForCondition } from '@heynixie/testing';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { spawnTestNixie } from './test-utils/spawn-test-nixie';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-backup-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it backs up a running server and restores it into an empty data directory through the nixie executable, and the restarted server reads its messages with the deployment key', async () => {
  const ctx = await setupTest();
  const nixie = await spawnTestNixie();
  const api = await createTestClient(nixie);

  nixie.model.addReplies({ text: 'Quince-reply-4ZT9' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Plum-message-7QK2',
    thread: 'conversation',
  });

  // the real guest starts the Agent SDK's CLI cold, which outlasts the default wait on a small host
  await waitForCondition(
    async () => {
      const read = await api.client.conversation.read({ thread: 'conversation' });

      return read.records.some((record) => record.message?.text === 'Quince-reply-4ZT9');
    },
    { timeoutMs: 25_000, intervalMs: 100 },
  );

  const target = join(ctx.directory, 'backup');

  const backup = await runHostCommand(nixie.configPath, ['backup', '--to', target]);

  nixie.sendSignal('SIGTERM');

  await nixie.waitForExit();

  await rm(nixie.dataDir, { recursive: true, force: true });
  await mkdir(nixie.dataDir);

  const restore = await runHostCommand(nixie.configPath, ['restore', '--from', target, '--yes']);

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

  expect(backup.exitCode).toBe(0);
  expect(backup.stdout).toStartWith('copied nixie.db\ncopied keys.db\n');
  expect(backup.stdout).toInclude(`nixie backed up nixie.db and keys.db into ${target} in `);
  expect(restore.exitCode).toBe(0);
  expect(restore.stdout).toInclude(`nixie restored nixie.db and keys.db from ${target}\n`);

  expect(page.records.map((record) => record.message?.text)).toIncludeAllMembers([
    'Plum-message-7QK2',
    'Quince-reply-4ZT9',
  ]);
});
