import { expect, test } from 'bun:test';
import { githubAPIURL } from '@heynixie/definitions-github/mocks';
import invariant from 'tiny-invariant';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  return nixie;
}

test('it serves prompt_read to the conversation, which returns the built-in compaction prompt', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'prompt_read', input: { id: 'compaction' } } },
    { text: 'Read it.' },
  );

  await sendClientMessage(api.client, { text: 'Show me the compaction prompt.' }, 'Read it.');

  const read = ctx.toolResults.at(-1);

  invariant(read);

  const answer: unknown = JSON.parse(read.result);

  expect(read.name).toBe('prompt_read');

  expect(answer).toMatchObject({
    structuredContent: {
      id: 'compaction',
      parts: [
        { name: 'instruction', override: null },
        { name: 'safety', override: null },
      ],
      template: { text: '{{ parts.instruction }}\n{{ parts.safety }}', override: null },
    },
  });
});

test('it refuses a prompt_write proposal whose template reads a path the prompt does not accept, and keeps no proposal', async () => {
  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export:',
      '  repository: harbour/definitions',
      `  api_url: ${githubAPIURL}`,
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'prompt_write',
        input: {
          id: 'compaction',
          entry: { _template: '{{ parts.instruction }}\n{{ owner.birthday }}' },
          files: [],
          reason: 'Greet the owner on the day.',
        },
      },
    },
    { text: 'Refused.' },
  );

  await sendClientMessage(api.client, { text: 'Mention my birthday.' }, 'Refused.');

  const written = nixie.toolResults.at(-1);

  invariant(written);

  const answer: unknown = JSON.parse(written.result);

  const pending = await runHostCommand(nixie.configPath, ['prompt-pending']);

  expect(written.name).toBe('prompt_write');

  expect(answer).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: 'the override fails the definitions checks: nixie.yaml: the template of the compaction prompt reads {{ owner.birthday }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, summary.words, parts.instruction, parts.safety',
      },
    ],
  });

  expect(pending.stdout.trim()).toBe('[]');
});
