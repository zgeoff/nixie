import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createTestClient } from './test-utils/create-test-client';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  return nixie;
}

test('it tells a new session how many moments were kept this week, and who kept them', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);
  const task = await api.client.conversation.read({ thread: 'queue-check' });

  const [first] = task.records;

  invariant(first);

  await api.client.memory.keepMoment({
    clientActionID: crypto.randomUUID(),
    thread: 'queue-check',
    firstSequence: first.sequence,
    lastSequence: first.sequence,
    title: 'The first queue check',
  });

  ctx.guest.addReplies({ text: 'Good morning.' });

  await sendClientMessage(api.client, { text: 'Morning.' }, 'Good morning.');

  const [turn] = ctx.guest.turns;

  invariant(turn);

  expect(turn.input[0]?.text).toMatch(
    /<system-message type="status"[^>]*>\n(?:- [^\n]*\n)*- Moments kept this week: 1 \(1 by the owner\)\. 1 is waiting for a reflection\.\n<\/system-message/u,
  );
});
