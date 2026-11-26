import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { deviceStore } from '../mocks/device-store';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const proxy = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({});

  await setupSignedInBrowser(view, { appURL: proxy.url, token: session.token });

  await view.navigate(`${proxy.url}/device-view`);

  await waitForPage(
    view,
    `document.querySelector('[aria-label="Device view"]') !== null && document.querySelector('[aria-label="Device view"] h1')?.innerText === 'Saturday'`,
    8000,
  );

  return {
    view,
    readBottom: () =>
      view.evaluate(
        `document.querySelector('[aria-label="Device view"]').getBoundingClientRect().bottom`,
      ),
    readHeight: () =>
      view.evaluate(
        `document.querySelector('[aria-label="Device view"]').getBoundingClientRect().height`,
      ),

    addRowAbove: (heightPx: number) =>
      view.evaluate(
        `(() => { const row = document.createElement('div'); row.style.height = '${String(heightPx)}px'; document.querySelector('[aria-label="Device view"]').before(row); return true; })()`,
      ),
    readLastResizeHeight: () => {
      const last = deviceStore.resizes.findMany().at(-1);

      return last === undefined ? null : last.height / last.pixelRatio;
    },
  };
}

test('it ends at the bottom of the window when a row sits above it, and reports that height', async () => {
  const ctx = await setupTest();

  await ctx.addRowAbove(90);

  await waitForPage(
    ctx.view,
    `Math.round(document.querySelector('[aria-label="Device view"]').getBoundingClientRect().bottom) === innerHeight`,
    8000,
  );

  const height = await ctx.readHeight();

  await waitForCondition(() => ctx.readLastResizeHeight() === Math.round(Number(height)), {
    intervalMs: 50,
    timeoutMs: 5000,
  });

  const bottom = await ctx.readBottom();
  const windowHeight = await ctx.view.evaluate('innerHeight');

  expect(bottom).toBe(windowHeight);
});

test('it scrolls long material to its last line on a window shorter than the material', async () => {
  const ctx = await setupTest();

  const isLastLineReachable = await ctx.view.evaluate(
    `(() => {
      const screen = document.querySelector('[data-testid="screen"]');
      const list = document.createElement('ul');

      for (let line = 1; line <= 60; line += 1) {
        const item = document.createElement('li');

        item.textContent = 'Line ' + line;
        list.append(item);
      }

      screen.append(list);
      screen.scrollTop = screen.scrollHeight;

      const last = list.lastElementChild.getBoundingClientRect();
      const frame = screen.getBoundingClientRect();

      return screen.scrollHeight > screen.clientHeight && last.bottom <= frame.bottom;
    })()`,
  );

  expect(isLastLineReachable).toBeTrue();
});
