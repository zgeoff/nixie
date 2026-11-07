import { expect, test } from 'bun:test';
import { createTestClient, sendClientMessage } from '@heynixie/server/test-utils';
import { checkBrowserSkip, setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const journey = await startWebJourney();
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return { ...journey, api };
}

test.skipIf(browserSkip.isSkipped)(
  'it makes a memory the model proposed active once the user approves it on the proposals page',
  async () => {
    const ctx = await setupTest();

    // a write with no quote from the user's own words waits for the user's review
    ctx.nixie.model.addReplies(
      {
        toolUse: {
          name: 'mcp__nixie__memory_remember',
          input: { text: 'The user keeps bees on the allotment.' },
        },
      },
      { text: 'I will ask you before I remember that.' },
    );

    await sendClientMessage(
      ctx.api.client,
      { text: 'I took the bees some sugar water today.' },
      'I will ask you before I remember that.',
      { timeoutMs: 10_000 },
    );

    await ctx.view.navigate(`${ctx.appURL}/memory/proposals`);

    await waitForPage(
      ctx.view,
      'document.querySelector(\'li[aria-label="The user keeps bees on the allotment."] button:not([disabled])\') !== null',
    );

    await ctx.view.click('li[aria-label="The user keeps bees on the allotment."] button');

    await waitForPage(
      ctx.view,
      'document.querySelector(\'li[aria-label="The user keeps bees on the allotment."]\') === null',
    );

    await ctx.view.navigate(`${ctx.appURL}/memory`);

    await waitForPage(
      ctx.view,
      "document.body.innerText.includes('The user keeps bees on the allotment.')",
    );

    const items = await ctx.nixie.readMemoryItems();

    expect(items.map((item) => item.state)).toStrictEqual(['active']);
  },
);
