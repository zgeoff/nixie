import { expect, onTestFinished, test } from 'bun:test';
import { probeProcessGone, readDescendants, waitForCondition } from '@heynixie/testing';
import { createTestClient } from './create-test-client';
import { startSpawnedNixie } from './start-spawned-nixie';

test('it stops the guest of a turn still running once the test finishes', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const clients = await createTestClient(server);

  nixie.model.addReplies({ text: 'Held.', gate: Promise.withResolvers<void>().promise });

  await clients.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Check the tide at noon.',
    thread: 'conversation',
  });

  await nixie.waitForModelCalls(1);

  const turnPIDs = readDescendants(process.pid);

  onTestFinished(async () => {
    await waitForCondition(() => turnPIDs.every((pid) => probeProcessGone(pid)));
  });

  expect(turnPIDs.length).toBeGreaterThanOrEqual(3);
});

test('it waits for the model call of a turn that the real guest starts', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const clients = await createTestClient(server);

  nixie.model.addReplies({ text: 'Held.', gate: Promise.withResolvers<void>().promise });

  await clients.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Check the tide at dusk.',
    thread: 'conversation',
  });

  await nixie.waitForModelCalls(1);

  expect(nixie.model.requests.filter((request) => request.path === '/v1/messages')).toHaveLength(1);
});
