import { expect, test } from 'bun:test';
import type { StreamClient } from '@wringer/stream';
import { readConversationTurn } from './read-conversation-turn';

function setupTest() {
  const client: Pick<StreamClient, 'read'> = {
    read: () => Promise.resolve({ name: 'app', records: [], more: false, cursor: 0 }),
  };

  return { client };
}

test('it fails with check-failed once the wait set by waitMs passes with no records', async () => {
  const ctx = setupTest();

  const outcome = readConversationTurn(ctx.client, {
    message: 'Hello.',
    reply: 'Hi.',
    waitMs: 1,
  });

  await expect(outcome).rejects.toMatchObject({ code: 'check-failed' });
});
