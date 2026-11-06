import { expect, onTestFinished, test } from 'bun:test';
import { checkBrowserSkip } from './check-browser-skip';
import { createBrowserView } from './create-browser-view';
import { waitForPage } from './wait-for-page';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const view = createBrowserView();

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  return { view };
}

test.skipIf(browserSkip.isSkipped)(
  'it resolves once the expression turns true in the page',
  async () => {
    const ctx = await setupTest();

    await ctx.view.evaluate("setTimeout(() => { document.title = 'kettle boiled'; }, 200)");

    const waited = waitForPage(ctx.view, "document.title === 'kettle boiled'");

    await Promise.allSettled([waited]);

    expect(waited).resolves.toBeUndefined();
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it rejects with the expression when the page never makes it true',
  async () => {
    const ctx = await setupTest();

    const waited = waitForPage(ctx.view, "document.title === 'kettle boiled'", 200);

    await Promise.allSettled([waited]);

    expect(waited).rejects.toThrow("document.title === 'kettle boiled'");
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it keeps waiting while the expression gives a truthy value other than true',
  async () => {
    const ctx = await setupTest();

    await ctx.view.evaluate("document.title = 'kettle boiled'");

    const waited = waitForPage(ctx.view, 'document.title', 200);

    await Promise.allSettled([waited]);

    expect(waited).rejects.toThrow('document.title');
  },
);
