import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createTestClient } from './test-utils/create-test-client';
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
