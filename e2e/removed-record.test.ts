import { expect, test } from 'bun:test';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import {
  createTestClient,
  sendClientMessage,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import invariant from 'tiny-invariant';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie };
}

test('it reads a message removed through the API as removed after nixie restarts, in the thread and in the moment', async () => {
  const ctx = await setupTest();

  const server = ctx.nixie.harness.start();

  const api = await createTestClient(server);

  ctx.nixie.model.addReplies({ text: 'Fig-reply-3MV8' });

  // The turn starts the real SDK in a guest process, which outlasts the helper's default wait on
  // a busy host.
  const records = await sendClientMessage(
    api.client,
    { text: 'Olive-message-5RD1' },
    'Fig-reply-3MV8',
    {
      timeoutMs: 30_000,
    },
  );

  const sent = records.find((record) => record.message?.text === 'Olive-message-5RD1');

  invariant(sent);

  const kept = await api.client.memory.keepMoment({
    clientActionID: crypto.randomUUID(),
    firstSequence: sent.sequence,
    lastSequence: sent.sequence,
    thread: 'conversation',
    title: 'The olive question',
  });

  await api.client.conversation.forget({
    clientActionID: crypto.randomUUID(),
    sequence: sent.sequence,
    thread: 'conversation',
  });

  await server.sendStopSignal();
  await server.waitForExit();

  const restarted = ctx.nixie.harness.start();

  const listening = await restarted.waitForLogEvent('http.listening');

  await restarted.waitForLogEvent('ready');

  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `http://127.0.0.1:${String(listening['port'])}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${api.token}` },
    }),
  );

  const page = await client.conversation.read({ thread: 'conversation' });
  const span = await client.memory.readMomentSpan({ momentID: kept.momentID });

  const removed = page.records.find((record) => record.sequence === sent.sequence);

  expect(removed?.isRemoved).toBeTrue();

  expect(span.records.map((record) => [record.isGap, record.isRemoved])).toStrictEqual([
    [true, true],
  ]);
});
