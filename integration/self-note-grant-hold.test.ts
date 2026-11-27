import { expect, test } from 'bun:test';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startInProcessNixie({ hasStarterRules: false });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  return {
    nixie,
    api,
  };
}

test('it holds a define that sets self notes for a passkey, and applies nothing without one', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.define',
        input: {
          name: 'Tidy the notes',
          brief: 'Write down what you notice about yourself.',
          memory: 'self_notes',
          trigger: { at: '2030-01-01T00:00:00Z' },
        },
      },
    },
    { text: 'I asked you first.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Hello there.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const answered = await ctx.api.client.approvals.answerProposals({
    answers: listed.items.map((item) => ({
      proposalID: item.proposal.proposalID,
      actionHash: item.proposal.actionHash,
      choice: 'approve' as const,
      clientActionID: crypto.randomUUID(),
    })),
  });

  const inForce = await ctx.api.client.definitions.listTasks();

  const hasDefinition = inForce.definitions.some(
    (definition) => definition.name === 'Tidy the notes',
  );

  expect({
    held: listed.items.map((item) => [item.proposal.cause, item.passkeyChoices]),
    answered: answered.results.map((result) => ('error' in result ? result.error : 'ok')),
    hasDefinition,
  }).toStrictEqual({
    held: [['always_ask', ['approve']]],
    answered: ['PASSKEY_REQUIRED'],
    hasDefinition: false,
  });
});
