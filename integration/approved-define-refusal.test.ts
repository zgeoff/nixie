import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';

async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
      await mkdir(join(definitions, 'rules'));
    },
  });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  const countOutcomes = async () => {
    const read = await api.client.conversation.read({ thread: 'conversation' });

    return read.records.filter((record) => record.kind === 'action.outcome').length;
  };

  const readTurnTexts = () =>
    nixie.guest.received.flatMap((received) =>
      received.frame.type === 'turn'
        ? [received.frame.input.map((message) => message.text).join('\n')]
        : [],
    );

  return { nixie, api, countOutcomes, readTurnTexts };
}

test('it shows the owner an approved task.define that the define refused as failed', async () => {
  const ctx = await setupTest();

  const trigger = {
    schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] }, zone: 'owner' },
  };

  ctx.nixie.guest.addReplies(
    {
      toolUse: {
        name: 'task.define',
        input: { name: 'Water the tomatoes', brief: 'Water them.', trigger },
      },
    },
    {
      toolUse: {
        name: 'task.define',
        input: { name: 'Water the tomatoes', brief: 'Water them well.', trigger },
      },
    },
    { text: 'I asked you first.' },
    { text: 'Done.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Hello there.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const proposalIDs = listed.items.map((item) => item.proposal.proposalID);

  await ctx.api.client.approvals.answerProposals({
    answers: listed.items.map((item) => ({
      proposalID: item.proposal.proposalID,
      actionHash: item.proposal.actionHash,
      choice: 'approve' as const,
      clientActionID: crypto.randomUUID(),
    })),
  });

  await waitForCondition(async () => (await ctx.countOutcomes()) === 2);

  const read = await ctx.api.client.approvals.readProposals({ proposalIDs });

  expect(read.proposals.map((proposal) => proposal.call)).toStrictEqual([
    { state: 'applied', reason: null },
    { state: 'failed', reason: 'the tool refused the call: ID_TAKEN' },
  ]);
});

test('it tells the next turn that the approved task.define failed, with the refusal it returned', async () => {
  const ctx = await setupTest();

  const trigger = {
    schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] }, zone: 'owner' },
  };

  ctx.nixie.guest.addReplies(
    {
      toolUse: {
        name: 'task.define',
        input: { name: 'Feed the cat', brief: 'Feed her.', trigger },
      },
    },
    {
      toolUse: {
        name: 'task.define',
        input: { name: 'Feed the cat', brief: 'Feed her twice.', trigger },
      },
    },
    { text: 'I asked you first.' },
    { text: 'One of them was refused.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Hello there.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  await ctx.api.client.approvals.answerProposals({
    answers: listed.items.map((item) => ({
      proposalID: item.proposal.proposalID,
      actionHash: item.proposal.actionHash,
      choice: 'approve' as const,
      clientActionID: crypto.randomUUID(),
    })),
  });

  await waitForCondition(() => ctx.readTurnTexts().length >= 2);

  const turn = ctx.readTurnTexts().at(1) ?? '';

  expect(turn).toIncludeMultiple([
    'failed: the call was refused.',
    'the tool refused the call: ID_TAKEN',
    '{"refused":{"code":"ID_TAKEN"}}',
  ]);
});
