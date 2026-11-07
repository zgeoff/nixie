import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { checkBrowserSkip, setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const journey = await startWebJourney();
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return journey;
}

test.skipIf(browserSkip.isSkipped)(
  'it shows the reply to a message sent from the page, and stops the spinner',
  async () => {
    const ctx = await setupTest();

    ctx.nixie.model.addReplies({ text: 'The heron left the pond at dawn.' });

    // the image pickers turn on as the page hydrates, and a submit before that posts the bare form
    await waitForPage(
      ctx.view,
      "document.querySelector('input[type=file]:not([disabled])') !== null",
    );

    await ctx.view.click('textarea[aria-label="Message"]');
    await ctx.view.cdp('Input.insertText', { text: 'Where did the heron go?' });
    await ctx.view.click('button[type=submit]');

    await waitForPage(
      ctx.view,
      "document.body.innerText.includes('The heron left the pond at dawn.')",
    );

    await waitForPage(ctx.view, "document.querySelector('[role=progressbar]') === null");

    const text: unknown = await ctx.view.evaluate('document.body.innerText');

    expect(text).toInclude('Where did the heron go?');
  },
);
