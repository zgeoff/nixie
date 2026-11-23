import { expect, test } from 'bun:test';
import {
  createTestClient,
  runHostCommand,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';

async function setupTest() {
  const nixie = await startInProcessNixie({ hasStarterRules: false });

  await nixie.waitForLogEvent('ready');

  const api = await createTestClient(nixie);

  return {
    nixie,
    api,
    readPending: async () => {
      const pending = await runHostCommand(nixie.configPath, ['memory-pending']);

      return z.array(z.object({ text: z.string() })).parse(JSON.parse(pending.stdout));
    },
  };
}

test('it holds a define that sets self notes for approval, then runs the approved definition with a self-note write', async () => {
  const ctx = await setupTest();

  const atMs = Date.now() + 1500;

  const at = new Date(atMs).toISOString().replace(/\.\d+Z$/u, 'Z');

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.define',
        input: {
          name: 'Tidy the notes',
          brief: 'Write down what you notice about yourself.',
          memory: 'self_notes',
          trigger: { at },
        },
      },
    },
    { text: 'I asked you first.' },
  );

  ctx.nixie.guest.addKindReplies(
    'worker',
    {
      toolUse: {
        name: 'memory.remember',
        input: {
          subject: 'self',
          gist: 'a gist',
          topic: 'a topic',
          text: 'I keep my notes short.',
        },
      },
    },
    { text: 'Noted.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Hello there.' }, 'I asked you first.');

  const listed = await ctx.api.client.approvals.listItems();

  const definedBeforeApproval = ctx.nixie.guest.received.some(
    (received) => received.owner !== 'conversation',
  );

  await ctx.api.client.approvals.answerProposals({
    answers: listed.items.map((item) => ({
      proposalID: item.proposal.proposalID,
      actionHash: item.proposal.actionHash,
      choice: 'approve' as const,
      clientActionID: crypto.randomUUID(),
    })),
  });

  await waitForCondition(() => Date.now() > atMs + 1000);

  ctx.nixie.signalStop();

  await ctx.nixie.waitForExit();

  const again = ctx.nixie.startAgain();

  await waitForCondition(() =>
    again.guest.received.some((received) => received.owner !== 'conversation'),
  );

  await waitForCondition(async () => {
    const waiting = await ctx.readPending();

    return waiting.length === 1;
  });

  const pending = await ctx.readPending();

  expect([listed.items.length, definedBeforeApproval]).toStrictEqual([1, false]);
  expect(pending).toStrictEqual([{ text: 'I keep my notes short.' }]);
});
