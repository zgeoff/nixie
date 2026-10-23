import { expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createTestClient, runHostCommand, sendClientMessage } from '@heynixie/server/test-utils';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { startSpawnedNixie } from './test-utils/start-spawned-nixie';

test('it backs up a running server and restores it into an empty data directory through the nixie executable, and the restarted server reads its messages with the deployment key', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  nixie.model.addReplies({ text: 'Quince-reply-4ZT9' });

  await sendClientMessage(api.client, { text: 'Plum-message-7QK2' }, 'Quince-reply-4ZT9');

  const target = join(nixie.directory, 'backup');

  const backup = await runHostCommand(nixie.configPath, ['backup', '--to', target]);

  await server.sendStopSignal();
  await server.waitForExit();

  await rm(nixie.dataDir, { recursive: true, force: true });
  await mkdir(nixie.dataDir);

  const restore = await runHostCommand(nixie.configPath, ['restore', '--from', target, '--yes']);

  const restarted = nixie.harness.start();

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
