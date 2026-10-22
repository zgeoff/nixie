import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { checkBrowserSkip } from '../test-utils/check-browser-skip';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  // Chrome's sandbox needs user namespaces that a container or a root user lacks, and the browser
  // loads only pages from the loopback servers this test starts.
  const view = new Bun.WebView({ backend: { argv: ['--no-sandbox'], type: 'chrome', url: false } });

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { appURL: app.url, view };
}

test.skipIf(browserSkip.isSkipped)(
  'it opens the item a notice links to at the top of the memory page',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    const item = await store.memoryItems.create({
      shortID: 'k3m9qa',
      versions: [{ text: 'Plays the cello' }],
    });

    await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

    await ctx.view.navigate(`${ctx.appURL}/memory?item=${item.itemID}`);

    await waitFor(
      async () => {
        const opened: unknown = await ctx.view.evaluate(
          "document.querySelector('[aria-label=\"Opened item\"]')?.innerText ?? ''",
        );

        expect(opened).toInclude('Plays the cello');
      },
      { timeout: 10_000 },
    );
  },
  120_000,
);
