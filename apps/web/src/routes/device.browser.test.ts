import { expect, onTestFinished, test } from 'bun:test';
import { deviceStore } from '../mocks/device-store';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

interface Viewport {
  readonly width: number;
  readonly height: number;
}

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const proxy = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(async () => {
    await view.cdp('Emulation.clearDeviceMetricsOverride');
  });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({ deviceName: 'desk panel' });

  await setupSignedInBrowser(view, { appURL: proxy.url, token: session.token });

  return {
    appURL: proxy.url,
    view,
    readResizes: () =>
      deviceStore.resizes.findMany().map((row) => ({ width: row.width, height: row.height })),
    watchResizeEvents: () =>
      view.evaluate(
        `(globalThis.resizeEventSize = null, addEventListener('resize', () => { resizeEventSize = innerWidth + 'x' + innerHeight }), true)`,
      ),

    // The page runs no timer while the virtual clock is paused, so the debounce window lasts until
    // the test advances the clock. Chrome applies each size at once, but can hold a resize event
    // after the first until a timer runs, so the test waits for the page's size, not that event
    pausePageClock: () => view.cdp('Emulation.setVirtualTimePolicy', { policy: 'pause' }),

    // Chrome holds the virtual clock while a request is in flight, so the budget covers the page's
    // timers and replies alike whatever the test machine's speed, then the clock pauses again
    advancePageClock: async (budgetMs: number) => {
      const budgetSpent = new Promise<void>((resolve) => {
        view.addEventListener(
          'Emulation.virtualTimeBudgetExpired',
          () => {
            resolve();
          },
          {
            once: true,
          },
        );
      });

      await view.cdp('Emulation.setVirtualTimePolicy', {
        policy: 'pauseIfNetworkFetchesPending',
        budget: budgetMs,
      });

      await budgetSpent;
    },
    setViewport: (size: Viewport) =>
      view.cdp('Emulation.setDeviceMetricsOverride', {
        ...size,
        deviceScaleFactor: 1,
        mobile: false,
      }),
    waitForPage: (expression: string) => waitForPage(view, expression, 8000),
  };
}

test('it hydrates under its content security policy, switches the screen on and shows the scene', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/device`);
  await ctx.waitForPage(`document.body.innerText.includes('Switch on screen')`);

  // the button answers only once React has hydrated the page under the policy
  await ctx.view.click('button');

  await ctx.waitForPage(
    `document.querySelector('[data-testid="screen"] h1')?.innerText === 'Saturday'`,
  );

  const policy = await fetch(`${ctx.appURL}/device`).then((response) =>
    response.headers.get('content-security-policy'),
  );

  expect(policy).toContain("frame-ancestors 'none'");
});

test('it enters and leaves full screen from the toggle, and follows the browser on Escape', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/device`);
  await ctx.waitForPage(`document.querySelector('button[name=fullscreen]:enabled') !== null`);
  await ctx.view.click('button[name=fullscreen]');

  await ctx.waitForPage(
    `document.fullscreenElement === document.documentElement && document.querySelector('button[name=fullscreen]').innerText === 'Leave full screen'`,
  );

  await ctx.view.click('button[name=fullscreen]');

  await ctx.waitForPage(
    `document.fullscreenElement === null && document.querySelector('button[name=fullscreen]').innerText === 'Full screen'`,
  );
});

test('it sends one resize with the new size after the window resizes', async () => {
  const ctx = await setupTest();

  await ctx.setViewport({ width: 1000, height: 700 });
  await ctx.view.navigate(`${ctx.appURL}/device`);
  await ctx.waitForPage(`document.body.innerText.includes('Switch on screen')`);
  await ctx.view.click('button');
  await ctx.waitForPage(`document.querySelector('[data-testid="screen"] h1') !== null`);
  await ctx.watchResizeEvents();
  await ctx.pausePageClock();
  await ctx.setViewport({ width: 800, height: 600 });

  // the page has seen a resize event at the first size, so a page that sends on every event
  // stores this size too
  await ctx.waitForPage(`resizeEventSize === '800x600'`);
  await ctx.setViewport({ width: 820, height: 610 });
  await ctx.waitForPage('innerWidth === 820 && innerHeight === 610');
  await ctx.advancePageClock(2500);

  expect(ctx.readResizes()).toStrictEqual([{ width: 820, height: 610 }]);
});
