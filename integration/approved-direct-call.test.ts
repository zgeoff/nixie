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

async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    roleModelURLs: { worker: 'http://127.0.0.1:4050' },
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));

      await writeFile(
        join(definitions, 'rules', 'start.yaml'),
        'ask-export:\n  outcome: ask\n  tools: [memory.export, worker.run]\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  const readThread = async () => {
    const read = await api.client.conversation.read({ thread: 'conversation' });

    return read.records;
  };

  const approve = (proposalID: string, actionHash: string) =>
    api.client.approvals.answerProposal({
      proposalID,
      actionHash,
      choice: 'approve',
      clientActionID: crypto.randomUUID(),
    });

  const waitForOutcome = () =>
    waitForCondition(async () => {
      const records = await readThread();

      return records.some((record) => record.kind === 'action.outcome');
    });

  const readTurnTexts = () =>
    nixie.guest.received.flatMap((received) =>
      received.frame.type === 'turn' && !received.owner.startsWith('worker_run:')
        ? [received.frame.input.map((message) => message.text).join('\n')]
        : [],
    );

  return { nixie, api, readThread, approve, waitForOutcome, readTurnTexts };
}

test('it starts one turn for an approved call, which reads its outcome with the approval time and no message of the approval', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'memory.export', input: {} } },
    { text: 'I asked you first.' },
    { text: 'It could not export.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Export my memory.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const item = listed.items.at(0);

  invariant(item, 'the call asks');

  await ctx.approve(item.proposal.proposalID, item.proposal.actionHash);
  await ctx.waitForOutcome();

  await waitForCondition(() => ctx.readTurnTexts().length >= 2);

  expect(ctx.readTurnTexts()).toStrictEqual([
    expect.toInclude('Export my memory.'),
    expect.toSatisfy(
      (turn: string) =>
        !turn.includes(`Approved \`${item.proposal.shortID}\``) &&
        /An action settled[^\n]*\nApproved \w{3} \d+ \w{3}, \d\d:\d\d, /v.test(turn),
    ),
  ]);
});

test('it runs an approved memory export once, under the approval, and the next turn reads its message', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'memory.export', input: {} } },
    { text: 'I asked you first.' },
    { text: 'It could not export.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Export my memory.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const item = listed.items.at(0);

  invariant(item, 'the call asks');

  await ctx.approve(item.proposal.proposalID, item.proposal.actionHash);
  await ctx.waitForOutcome();

  await waitForCondition(() => ctx.readTurnTexts().length >= 2);

  const records = await ctx.readThread();

  const [, turn] = ctx.readTurnTexts();

  expect(records.filter((record) => record.kind === 'action.attempt_started')).toHaveLength(1);
  expect(records.filter((record) => record.kind === 'tool_result')).toHaveLength(2);
  expect(turn).toContain('Approved');
  expect(turn).toContain('The owner exports memory from the memory view, which saves the file.');
});

test('it refuses a second answer to the approval, and runs nothing more', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'memory.export', input: {} } },
    { text: 'I asked you first.' },
    { text: 'It could not export.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Export my memory.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const item = listed.items.at(0);

  invariant(item, 'the call asks');

  await ctx.approve(item.proposal.proposalID, item.proposal.actionHash);
  await ctx.waitForOutcome();

  await expect(
    ctx.approve(item.proposal.proposalID, item.proposal.actionHash),
  ).rejects.toBeInstanceOf(Error);

  const records = await ctx.readThread();

  expect(records.filter((record) => record.kind === 'action.attempt_started')).toHaveLength(1);
  expect(records.filter((record) => record.kind === 'action.queued')).toHaveLength(1);
});

test('it writes no second proposal for the same call while the first still waits, and names the open one', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'memory.export', input: {} } },
    { text: 'I asked you first.' },
    { toolUse: { name: 'memory.export', input: {} } },
    { text: 'Still waiting.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Export my memory.' }, 'I asked you first.');
  await sendClientMessage(ctx.api.client, { text: 'Export it again.' }, 'Still waiting.');

  const listed = await ctx.api.client.approvals.listItems();
  const records = await ctx.readThread();

  const results = ctx.nixie.toolResults.map((entry) => entry.result);

  expect(listed.items).toHaveLength(1);
  expect(records.filter((record) => record.kind === 'policy.action_proposed')).toHaveLength(1);

  expect(results.at(-1)).toContain(
    `Waiting for approval as \`${listed.items.at(0)?.proposal.shortID ?? 'none'}\``,
  );
});

test('it runs an approved worker once under the approval, and the next turn reads its answer as outside content', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    { toolUse: { name: 'worker.run', input: { question: 'What is 2 + 2?' } } },
    { text: 'I asked you first.' },
    { text: 'The worker says four.' },
  );

  ctx.nixie.guest.addKindReplies('worker', { text: 'Four.' });

  await sendClientMessage(ctx.api.client, { text: 'Ask a worker.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const item = listed.items.at(0);

  invariant(item, 'the call asks');

  await ctx.approve(item.proposal.proposalID, item.proposal.actionHash);
  await ctx.waitForOutcome();

  await waitForCondition(() => ctx.readTurnTexts().length >= 2);

  const records = await ctx.readThread();

  const turn = ctx.readTurnTexts().at(1) ?? '';

  expect(records.filter((record) => record.kind === 'worker.run_started')).toHaveLength(1);
  expect(records.filter((record) => record.kind === 'action.attempt_started')).toHaveLength(1);
  expect(turn).toContain('<tool-result source="untrusted"');
  expect(turn).toContain('Four.');
});

test('it tells the next turn which approved call failed and why', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    { toolUse: { name: 'worker.run', input: { question: 'What is 2 + 2?' } } },
    { text: 'I asked you first.' },
    { text: 'The worker could not answer.' },
  );

  ctx.nixie.guest.addKindReplies('worker', { failure: 'the worker could not reach its model' });

  await sendClientMessage(ctx.api.client, { text: 'Ask a worker.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const item = listed.items.at(0);

  invariant(item, 'the call asks');

  await ctx.approve(item.proposal.proposalID, item.proposal.actionHash);
  await ctx.waitForOutcome();

  await waitForCondition(() => ctx.readTurnTexts().length >= 2);

  const turn = ctx.readTurnTexts().at(1) ?? '';

  expect(turn).toContain(
    `The call \`worker.run\` (\`${item.proposal.proposalID}\`) failed: the call was refused.`,
  );
});
