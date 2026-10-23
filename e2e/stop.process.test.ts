import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { startTestNixie } from './test-utils/start-test-nixie';

test('it stops claiming steps on SIGTERM, lets the turn in flight commit and exits 0', async () => {
  const nixie = await startTestNixie();

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  const gate = Promise.withResolvers<void>();

  nixie.model.addReplies({ text: 'Held-reply', gate: gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hello.',
    thread: 'conversation',
  });

  // the real guest starts the Agent SDK's CLI cold, which outlasts the default wait on a small host
  await waitForCondition(
    () => nixie.model.requests.some((request) => request.path === '/v1/messages'),
    { timeoutMs: 25_000, intervalMs: 100 },
  );

  await server.sendStopSignal();

  gate.resolve();

  const run = await server.waitForExit();

  expect(run.exit).toStrictEqual({ code: 0, signal: null });

  expect(run.records).toIncludeAllPartialMembers([
    { kind: 'model.reply', erasable: { status: 'readable', fields: { text: 'Held-reply' } } },
  ]);
});
