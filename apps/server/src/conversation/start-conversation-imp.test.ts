import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createTestClient } from '../test-utils/create-test-client';
import { sendClientMessage } from '../test-utils/send-client-message';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest(extraConfig: readonly string[] = []) {
  const nixie = await startInProcessNixie({ extraConfig });

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
    /<system-message type="status"[^>]*>\n(?:- [^\n]*\n)*- Moments kept this week: 1 \(1 by the owner\)\. 1 is waiting for a reflection\.\n- Memory index: 0 items\n- Memory index tokens: 0 of 3000\n<\/system-message/u,
  );
});

test('it creates the conversation sandbox from the conversation image of the needed images', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Hello.' });

  await sendClientMessage(api.client, { text: 'Hi.' }, 'Hello.');

  const sandboxes = await ctx.guest.adapter.list('conversation');

  expect(sandboxes.map((sandbox) => [sandbox.spec.kind, sandbox.spec.image])).toStrictEqual([
    ['conversation', 'nixie-conversation-cccccccccccc'],
  ]);
});

test('it tells a new session, unprompted, that the model credential expires within the warning time', async () => {
  const expiresAt = new Date(Date.now() + 2 * 86_400_000).toISOString();

  const ctx = await setupTest([`model_credential: { expires_at: "${expiresAt}" }`]);
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Hello.' });

  await sendClientMessage(api.client, { text: 'Hi.' }, 'Hello.');

  const [turn] = ctx.guest.turns;

  invariant(turn);

  expect(turn.input[0]?.text).toInclude('- The model credential: expiring on');
});

test('it tells a new session nothing of a model credential that expires after the warning time', async () => {
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();

  const ctx = await setupTest([`model_credential: { expires_at: "${expiresAt}" }`]);
  const api = await createTestClient(ctx);

  ctx.guest.addReplies({ text: 'Hello.' });

  await sendClientMessage(api.client, { text: 'Hi.' }, 'Hello.');

  const [turn] = ctx.guest.turns;

  invariant(turn);

  expect(turn.input[0]?.text).not.toInclude('The model credential');
});
