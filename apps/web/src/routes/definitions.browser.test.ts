import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { mockViewStore } from '../mocks/mock-view-store';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { appURL: app.url, view };
}

test('it shows a definition with its rendered trigger and next fire', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await mockViewStore.definitions.create({
    createdBy: { kind: 'definitions_seeded', sequence: 3 },
    definitionID: 'water-the-tomatoes',
    name: 'Water the tomatoes',
    next: 'Fri 12 Mar',
    origin: 'definitions',
    rendered: 'every Friday at 08:00',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/definitions`);

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Water the tomatoes');
      expect(text).toInclude('every Friday at 08:00 · next: Fri 12 Mar');
    },
    { timeout: 10_000 },
  );
});
