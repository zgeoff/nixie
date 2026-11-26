import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { mockLive } from '../mocks/mock-live';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const first = new Bun.WebView({ backend: 'chrome' });
  const second = new Bun.WebView({ backend: 'chrome' });
  const third = new Bun.WebView({ backend: 'chrome' });

  const tabs = [first, second, third] as const;

  for (const tab of tabs) {
    onTestFinished(() => {
      tab.close();
    });

    await tab.navigate('about:blank');
  }

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await first.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({});

  await setupSignedInBrowser(first, { appURL: app.url, token: session.token });

  const showsSaturday = `document.querySelector('[aria-label="Device view"] h1')?.innerText === 'Saturday'`;

  return {
    tabs,
    appURL: app.url,
    hideLockManager: (tab: Bun.WebView) =>
      tab.cdp('Page.addScriptToEvaluateOnNewDocument', {
        source: 'delete Navigator.prototype.locks;',
      }),
    waitForSaturday: (tab: Bun.WebView) => waitForPage(tab, showsSaturday, 8000),
    readShowsSaturday: (tab: Bun.WebView) => tab.evaluate(showsSaturday),
  };
}

test('it holds one device stream for three tabs that each show the device view, and draws it in each', async () => {
  const ctx = await setupTest();

  for (const tab of ctx.tabs) {
    await tab.navigate(`${ctx.appURL}/device-view`);
    await ctx.waitForSaturday(tab);
  }

  await waitFor(
    () => {
      expect([mockLive.openCount, mockLive.deviceOpenCount]).toStrictEqual([3, 1]);
    },
    { timeout: 5000 },
  );

  const shown = await Promise.all(ctx.tabs.map((tab) => ctx.readShowsSaturday(tab)));

  expect(shown).toStrictEqual([true, true, true]);
});

test('it holds one device stream for three tabs of a browser with no lock manager', async () => {
  const ctx = await setupTest();

  const [first, second, third] = ctx.tabs;

  for (const tab of ctx.tabs) {
    await ctx.hideLockManager(tab);
  }

  await first.navigate(`${ctx.appURL}/device-view`);
  await second.navigate(`${ctx.appURL}/`);
  await third.navigate(`${ctx.appURL}/device-view`);

  const lockManagers = await Promise.all(
    ctx.tabs.map((tab) => tab.evaluate(`'locks' in navigator`)),
  );

  expect(lockManagers).toStrictEqual([false, false, false]);

  await ctx.waitForSaturday(first);
  await ctx.waitForSaturday(third);

  await waitFor(
    () => {
      expect([mockLive.openCount, mockLive.deviceOpenCount]).toStrictEqual([3, 1]);
    },
    { timeout: 5000 },
  );
});
