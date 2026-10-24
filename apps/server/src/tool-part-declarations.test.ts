import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createTestClient } from './test-utils/create-test-client';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

test('it offers prompt_read and prompt_write to the conversation guest when the definitions export is configured', async () => {
  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export: { repository: harbour/definitions, api_url: "https://127.0.0.1:9" }',
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  const gate = Promise.withResolvers<void>();

  nixie.guest.addReplies({ text: 'Hello.', gate: gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => nixie.guest.turns.length === 1);

  const [received] = nixie.guest.received;

  invariant(received);

  const names = await nixie.readToolNames(received);

  gate.resolve();

  expect(names).toIncludeAllMembers(['prompt_read', 'prompt_write']);
});

test('it offers prompt_read alone to the conversation guest when no definitions export is configured', async () => {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  const gate = Promise.withResolvers<void>();

  nixie.guest.addReplies({ text: 'Hello.', gate: gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => nixie.guest.turns.length === 1);

  const [received] = nixie.guest.received;

  invariant(received);

  const names = await nixie.readToolNames(received);

  gate.resolve();

  expect(names).toContain('prompt_read');
  expect(names).not.toContain('prompt_write');
});
