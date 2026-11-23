import { expect, test } from 'bun:test';
import { createTestClient, sendClientMessage } from '@heynixie/server/test-utils';
import { setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

async function setupTest() {
  const journey = await startWebJourney();
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return { ...journey, api };
}

test('it makes a memory the model proposed active once the user approves it on the approvals page', async () => {
  const ctx = await setupTest();

  // a write with no quote from the user's own words waits for the user's review
  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: {
          text: 'The user keeps bees on the allotment.',
          gist: 'keeps bees',
          topic: 'allotment',
        },
      },
    },
    { text: 'I will ask you before I remember that.' },
  );

  await sendClientMessage(
    ctx.api.client,
    { text: 'I took the bees some sugar water today.' },
    'I will ask you before I remember that.',
    { timeoutMs: 5000 },
  );

  await ctx.view.navigate(`${ctx.appURL}/proposals`);

  await waitForPage(
    ctx.view,
    'document.querySelector(\'li[aria-label="The user keeps bees on the allotment."] summary\') !== null',
  );

  await ctx.view.click('li[aria-label="The user keeps bees on the allotment."] summary');

  await waitForPage(
    ctx.view,
    'document.querySelector(\'li[aria-label="The user keeps bees on the allotment."] button[name="approve"]:not([disabled])\') !== null',
  );

  // the expanded card's labels push the button below the window, and a click never scrolls
  await ctx.view.evaluate(
    'document.querySelector(\'li[aria-label="The user keeps bees on the allotment."] button[name="approve"]\').scrollIntoView()',
  );

  await ctx.view.click(
    'li[aria-label="The user keeps bees on the allotment."] button[name="approve"]',
  );

  await waitForPage(
    ctx.view,
    'document.querySelector(\'li[aria-label="The user keeps bees on the allotment."][data-state="approved"]\') !== null',
  );

  await ctx.view.navigate(`${ctx.appURL}/memory`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('The user keeps bees on the allotment.')",
  );

  const items = await ctx.nixie.readMemoryItems();

  expect(items.map((item) => item.state)).toStrictEqual(['active']);
});

test('it holds a re-file as one card with the gists folded, and the approval moves the items the card showed', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'The user keeps bees.', gist: 'keeps bees', topic: 'allotment' },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'The user grows leeks.', gist: 'grows leeks', topic: 'allotment' },
      },
    },
    { text: 'I will ask you before I remember those.' },
    {
      toolUse: {
        name: 'mcp__nixie__memory_retopic',
        input: {
          from: { topic: 'allotment', subject: 'owner' },
          to: { topic: 'garden', subject: 'owner' },
        },
      },
    },
    { text: 'I will ask you before I move them.' },
  );

  await sendClientMessage(
    ctx.api.client,
    { text: 'I took the bees some sugar water and dug the leeks.' },
    'I will ask you before I remember those.',
    { timeoutMs: 5000 },
  );

  const proposals = await ctx.api.client.approvals.listItems();

  for (const item of proposals.items) {
    await ctx.api.client.approvals.answerProposal({
      proposalID: item.proposal.proposalID,
      actionHash: item.proposal.actionHash,
      choice: 'approve',
      clientActionID: crypto.randomUUID(),
    });
  }

  await sendClientMessage(
    ctx.api.client,
    { text: 'Move the allotment notes to garden.' },
    'I will ask you before I move them.',
    { timeoutMs: 5000 },
  );

  const line = 'li[aria-label="owner/allotment → owner/garden, 2 items"]';

  await ctx.view.navigate(`${ctx.appURL}/proposals`);

  await waitForPage(ctx.view, `document.querySelector('${line} summary') !== null`);

  await ctx.view.click(`${line} summary`);

  await waitForPage(ctx.view, `document.querySelector('${line} dl details summary') !== null`);

  const folded = await ctx.view.evaluate(
    `(() => { const details = document.querySelector('${line} dl details'); return [document.querySelectorAll('${line}').length, details.open, details.querySelector('summary').textContent]; })()`,
  );

  await ctx.view.evaluate(
    `document.querySelector('${line} button[name="approve"]').scrollIntoView()`,
  );

  await ctx.view.click(`${line} button[name="approve"]`);

  await waitForPage(ctx.view, `document.querySelector('${line}[data-state="approved"]') !== null`);

  // the first reply answers the turn that the approved call starts
  ctx.nixie.model.addReplies(
    { text: 'Moved.' },
    { toolUse: { name: 'mcp__nixie__memory_recall', input: { topic: 'garden' } } },
    { text: 'Read the garden.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'What is under garden?' }, 'Read the garden.', {
    timeoutMs: 5000,
  });

  const prompt = JSON.stringify(ctx.nixie.model.requests.at(-1)?.body);

  expect(folded).toStrictEqual([1, false, '2 items']);
  expect(prompt).toMatch(/lines\\+":\[\{/u);
});
