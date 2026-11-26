import { expect, test } from 'bun:test';
import { parseFencedResult } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestClient } from '../test-utils/create-test-client';
import { runHostCommand } from '../test-utils/run-host-command';
import { sendClientMessage } from '../test-utils/send-client-message';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest() {
  const pendingSchema = z.array(z.object({ proposalID: z.string() }));
  const textBlock = z.object({ type: z.literal('text'), text: z.string() });
  const answerSchema = z.object({ content: z.array(textBlock) });

  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  const propose = async (text: string) => {
    nixie.guest.addReplies(
      { toolUse: { name: 'memory.remember', input: { gist: 'a gist', topic: 'a topic', text } } },
      { text: 'Noted.' },
    );

    await sendClientMessage(api.client, { text: `Note down: ${text}` }, 'Noted.');

    const listed = await runHostCommand(nixie.configPath, ['memory-pending']);

    const proposals = pendingSchema.parse(JSON.parse(listed.stdout));
    const newest = proposals.at(-1);

    invariant(newest);

    const read = await api.client.approvals.readProposals({ proposalIDs: [newest.proposalID] });

    return { proposalID: newest.proposalID, shortID: read.proposals[0]?.proposal.shortID ?? '' };
  };

  const readLastResult = () => {
    const last = nixie.toolResults.at(-1);

    invariant(last);

    const answer = answerSchema.parse(JSON.parse(last.result));

    return {
      name: last.name,
      result:
        last.name === 'proposals.withdraw'
          ? z.object({ structuredContent: z.unknown() }).parse(JSON.parse(last.result))
              .structuredContent
          : parseFencedResult(answer),
    };
  };

  return { nixie, api, propose, readLastResult };
}

test('it withdraws an open proposal of the caller by its short ID, and the list drops it', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose('Keeps two cats');

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'proposals.withdraw', input: { proposalID: proposed.shortID } } },
    { text: 'Withdrawn.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Never mind that one.' }, 'Withdrawn.');

  const withdrawn = ctx.readLastResult();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'proposals.pending', input: {} } },
    { text: 'Nothing waits.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'What waits?' }, 'Nothing waits.');

  expect([withdrawn.result, ctx.readLastResult().result]).toStrictEqual([
    { status: 'withdrawn' },
    { proposals: [] },
  ]);
});

test('it says a proposal is closed when the caller withdraws it a second time', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose('Keeps two cats');

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'proposals.withdraw', input: { proposalID: proposed.shortID } } },
    { text: 'Withdrawn.' },
    { toolUse: { name: 'proposals.withdraw', input: { proposalID: proposed.shortID } } },
    { text: 'Closed already.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'Never mind.' }, 'Withdrawn.');
  await sendClientMessage(ctx.api.client, { text: 'Again.' }, 'Closed already.');

  expect(ctx.readLastResult().result).toStrictEqual({ status: 'closed' });
});
