import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';

// An age of under a millisecond, so every payload that the first run wrote is old at the next start.
async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    extraConfig: ['erasure:', '  expire_after_days: 0.00000001'],
    roleModelURLs: { worker: 'http://127.0.0.1:4050' },
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));

      await writeFile(
        join(definitions, 'rules', 'start.yaml'),
        'allow-reads:\n  outcome: allow\n  tools: [time.now]\nask-worker:\n  outcome: ask\n  tools: [worker.run]\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  nixie.guest.addKindReplies(
    'conversation',
    { toolUse: { name: 'time.now', input: {} } },
    { toolUse: { name: 'worker.run', input: { question: 'What is 2 + 2?' } } },
    { text: 'I asked you first.' },
    { text: 'The worker says four.' },
  );

  nixie.guest.addKindReplies('worker', { text: 'Four.' });

  await sendClientMessage(api.client, { text: 'Ask a worker.' }, 'I asked you first.');

  const listed = await api.client.approvals.listItems();

  const item = listed.items.at(0);

  invariant(item, 'the worker call asks');

  await api.client.approvals.answerProposal({
    proposalID: item.proposal.proposalID,
    actionHash: item.proposal.actionHash,
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  await waitForCondition(async () => {
    const read = await api.client.conversation.read({ thread: 'conversation' });

    return read.records.some((record) => record.kind === 'action.outcome');
  });

  await waitForCondition(
    () =>
      nixie.guest.received.filter(
        (received) => received.frame.type === 'turn' && !received.owner.startsWith('worker_run:'),
      ).length >= 2,
  );

  return { nixie };
}

test('it expires the tool result and the connector result of a past run at the next start, and leaves the owner message', async () => {
  const ctx = await setupTest();

  ctx.nixie.signalStop();

  const first = await ctx.nixie.waitForExit();

  const again = ctx.nixie.startAgain();

  await again.waitForLogEvent('expiry.finished');

  again.signalStop();

  const second = await again.waitForExit();

  const expirable = first.records.filter(
    (record) =>
      ['tool_result', 'action.outcome'].includes(record.kind) &&
      record.erasable.status === 'readable',
  );

  const owner = first.records.filter((record) => record.kind === 'owner_message');

  const statusOf = (sequence: number) =>
    second.records.find((record) => record.sequence === sequence)?.erasable.status;

  expect(new Set(expirable.map((record) => record.kind))).toStrictEqual(
    new Set(['tool_result', 'action.outcome']),
  );

  expect(expirable.map((record) => statusOf(record.sequence))).toSatisfyAll(
    (status) => status === 'shredded',
  );

  expect(owner.map((record) => statusOf(record.sequence))).toSatisfyAll(
    (status) => status === 'readable',
  );
});
