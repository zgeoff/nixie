import { expect, onTestFinished, test } from 'bun:test';
import { createTestClient, sendClientMessage } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

async function setupTest() {
  const journey = await startWebJourney();
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  const site = Bun.serve({
    port: 0,
    routes: {
      '/gate': new Response(
        '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>',
        { headers: { 'content-type': 'text/html' } },
      ),
    },
  });

  onTestFinished(() => site.stop(true));

  return {
    ...journey,
    bannerText: 'asks you to take over the computer: a CAPTCHA blocks the sign-in',
    buildAskReplies: () => [
      {
        toolUse: {
          name: 'mcp__nixie__computer_handover',
          input: { reason: 'a CAPTCHA blocks the sign-in' },
        },
      },
      { text: 'I asked you to take over.' },
      { text: 'I wait for you.' },
    ],
    api,
    siteURL: `http://pages.test:${String(site.port)}`,
    send: (text: string, reply: string) =>
      sendClientMessage(api.client, { text }, reply, { timeoutMs: 8000 }),

    // the turn also reads the record of its own ask or cancel, which a further reply answers
    waitForEndedTurns: (count: number) =>
      waitForCondition(async () => {
        const records = await journey.nixie.readRecords();

        return records.filter((record) => record.kind === 'model.turn_ended').length >= count;
      }),
    readCloses: async () => {
      const records = await journey.nixie.readRecords();

      return records
        .filter((record) => record.kind === 'computer.handover_closed')
        .map((record) => record.payload);
    },
    readToolCalls: async () => {
      const records = await journey.nixie.readRecords();

      return records
        .filter((record) => record.kind === 'tool_called')
        .map((record) => String(record.payload['tool']))
        .filter((tool) => tool.startsWith('computer.'));
    },
  };
}

test('it clears the banner of an open page when the assistant cancels its ask with its tool', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies(...ctx.buildAskReplies());

  await ctx.view.navigate(`${ctx.appURL}/tasks`);
  await ctx.send('Sign in to the shop.', 'I asked you to take over.');
  await ctx.waitForEndedTurns(1);

  await waitForPage(ctx.view, `document.body.innerText.includes('${ctx.bannerText}')`);

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__computer_handover_cancel', input: {} } },
    { text: 'I withdrew the ask.' },
    { text: 'The ask is gone.' },
  );

  await ctx.send('Never mind the sign-in.', 'I withdrew the ask.');

  await waitForPage(
    ctx.view,
    "!document.body.innerText.includes('asks you to take over the computer')",
  );

  const closes = await ctx.readCloses();

  expect(closes).toMatchObject([{ by: 'assistant' }]);
});

test('it clears the banner of an open page when the ask expires on the clock', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies(...ctx.buildAskReplies());

  await ctx.view.navigate(`${ctx.appURL}/tasks`);
  await ctx.send('Sign in to the shop.', 'I asked you to take over.');
  await ctx.waitForEndedTurns(1);

  await waitForPage(ctx.view, `document.body.innerText.includes('${ctx.bannerText}')`);

  // the expiry wakes the conversation, which needs a reply
  ctx.nixie.model.addReplies({ text: 'The ask ran out.' });

  await ctx.nixie.harness.advance(61 * 60 * 1000);

  await waitForPage(
    ctx.view,
    "!document.body.innerText.includes('asks you to take over the computer')",
  );

  const closes = await ctx.readCloses();

  expect(closes).toMatchObject([{ by: 'expired' }]);
});

test('it shows the banner for an ask that follows the open of a page with a CAPTCHA', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__computer_browser_open', input: { url: `${ctx.siteURL}/gate` } },
    },
    ...ctx.buildAskReplies(),
  );

  await ctx.view.navigate(`${ctx.appURL}/tasks`);
  await ctx.send('Sign in to the shop.', 'I asked you to take over.');

  await waitForPage(ctx.view, `document.body.innerText.includes('${ctx.bannerText}')`);

  const calls = await ctx.readToolCalls();

  expect(calls).toStrictEqual(['computer.browser_open', 'computer.handover']);
});
