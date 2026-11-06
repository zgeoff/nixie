import { expect, test } from 'bun:test';
import { checkBrowserSkip, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

const browserSkip = await checkBrowserSkip();

async function setupTest() {
  return await startWebJourney();
}

test.skipIf(browserSkip.isSkipped)(
  'it enrols the browser with the code nixie issued, and keeps it signed in on the next visit',
  async () => {
    const ctx = await setupTest();

    await ctx.view.navigate(`${ctx.appURL}/`);

    // React marks the document as it hydrates it, and a submit before that posts the bare form
    await waitForPage(
      ctx.view,
      "Object.keys(document).some((key) => key.startsWith('_reactListening'))",
    );

    await ctx.view.click('input[autocomplete="one-time-code"]');
    await ctx.view.cdp('Input.insertText', { text: ctx.enrolmentCode });
    await ctx.view.click('label:nth-of-type(2) input');
    await ctx.view.cdp('Input.insertText', { text: 'hallway tablet' });
    await ctx.view.click('button[type=submit]');

    await waitForPage(ctx.view, "document.querySelector('textarea[aria-label=Message]') !== null");

    await ctx.view.navigate(`${ctx.appURL}/`);

    const page: unknown = await ctx.view.evaluate(
      "({ hasComposer: document.querySelector('textarea[aria-label=Message]') !== null, hasEnrolForm: document.body.innerText.includes('Enrol this browser') })",
    );

    expect(page).toStrictEqual({ hasComposer: true, hasEnrolForm: false });
  },
);
