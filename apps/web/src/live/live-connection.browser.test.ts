import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { mockLive } from '../mocks/mock-live';
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

test('it holds one stream on a thread page, and overlaps two while it switches to a page with no thread', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/`);

  await waitFor(
    () => {
      expect(mockLive.openedThreads).toContain('conversation');
      expect(mockLive.openCount).toBe(1);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('a[href="/tasks"]');

  await waitFor(
    () => {
      expect(mockLive.openedThreads.at(-1)).toBeUndefined();
      expect(mockLive.openCount).toBe(1);
    },
    { timeout: 10_000 },
  );

  expect(mockLive.peakOpenCount).toBe(2);
});
