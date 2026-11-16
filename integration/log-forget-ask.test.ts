import { expect, test } from 'bun:test';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  nixie.guest.addReplies({ text: 'Noted.' });

  const sent = await sendClientMessage(
    api.client,
    { text: 'The shed key sits under the blue pot.' },
    'Noted.',
  );

  const target = sent.find((record) => record.kind === 'owner_message');

  invariant(target, 'the message is in the thread');

  return {
    nixie,
    api,
    target: target.sequence,
    readThread: async () => {
      const read = await api.client.conversation.read({ thread: 'conversation' });

      return read.records;
    },
  };
}

test('it asks first under the starter rules, with the record on the card, and removes it once you approve', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'log.forget', input: { record: `#${String(ctx.target)}` } } },
    { text: 'I asked you first.' },
  );

  await sendClientMessage(
    ctx.api.client,
    { text: 'Forget my first message.' },
    'I asked you first.',
  );

  const listed = await ctx.api.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.body?.fields['kind'] === 'owner_message');

  invariant(item, 'the call asks');

  await ctx.api.client.approvals.answerProposal({
    proposalID: item.proposal.proposalID,
    actionHash: item.proposal.actionHash,
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  await waitForCondition(async () => {
    const records = await ctx.readThread();

    return records.some((record) => record.removal !== undefined);
  });

  const records = await ctx.readThread();

  expect(item.body?.fields).toStrictEqual({
    record: `#${String(ctx.target)}`,
    kind: 'owner_message',
    text: 'The shed key sits under the blue pot.',
    moments: '0',
    'memory items': '0',
  });

  expect(records.find((record) => record.sequence === ctx.target)).toStrictEqual({
    isRemoved: true,
    kind: 'owner_message',
    recordedAt: expect.toBeValidDate(),
    sequence: ctx.target,
    thread: 'conversation',
  });

  expect(
    records.filter((record) => record.forget !== undefined).map((record) => record.kind),
  ).toStrictEqual(['record.forget_started', 'record.forgotten']);

  expect(records.find((record) => record.removal !== undefined)?.removal).toStrictEqual({
    kind: 'owner_message',
    sequence: ctx.target,
  });
});
