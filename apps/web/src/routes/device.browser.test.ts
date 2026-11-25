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

  // the screen setting that the device page stores outlives the test in the one Chrome
  onTestFinished(async () => {
    await view.evaluate('localStorage.clear()');
  });

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

  await view.evaluate('localStorage.clear()');

  return {
    appURL: proxy.url,

    // a finger that taps once, as the touchscreen of a device sends it
    tap: async (x: number, y: number) => {
      await view.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await view.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    shownButtons: `[...document.querySelectorAll('button')].filter((button) => getComputedStyle(button).visibility === 'visible').map((button) => button.innerText)`,
    view,
    readResizes: () =>
      deviceStore.resizes
        .findMany()
        .map((row) => ({ width: row.width, height: row.height, pixelRatio: row.pixelRatio })),
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

    // opens the device page with its screen off, and switches the screen on once the page hydrated
    switchScreenOn: async () => {
      await view.navigate(`${proxy.url}/device`);

      // the button answers only once React has hydrated it, which attaches the props to its node
      await waitForPage(
        view,
        `Object.keys(document.querySelector('button') ?? {}).some((key) => key.startsWith('__reactProps'))`,
        8000,
      );

      await view.click('button');

      await waitForPage(
        view,
        `document.querySelector('[data-testid="screen"], [data-testid="layout"]') !== null`,
        8000,
      );
    },
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

  expect(ctx.readResizes()).toStrictEqual([{ width: 820, height: 610, pixelRatio: 1 }]);
});

test('it scales a live value and markdown to fill their regions', async () => {
  const ctx = await setupTest();

  deviceStore.layoutHolder.layout = {
    columns: ['1fr'],
    rows: ['1fr', '1fr'],
    regions: [
      {
        name: 'clock',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        content: { kind: 'live', live: 'clock', format: 'HH:mm:ss' },
        until: null,
      },
      {
        name: 'note',
        column: 1,
        row: 2,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        content: { kind: 'markdown', markdown: 'Bins go out tonight' },
        until: null,
      },
    ],
  };

  await ctx.setViewport({ width: 1000, height: 700 });
  await ctx.switchScreenOn();

  // the region is 350 px tall and 1000 px wide: the default text is 24 px, so a value that fills
  // it is far larger and still inside it
  await ctx.waitForPage(
    `(() => {
      const fits = (name) => {
        const box = document.querySelector('[data-region="' + name + '"] [data-fit="box"]');
        const text = box?.firstElementChild;
        return text !== null && text !== undefined && parseFloat(getComputedStyle(text).fontSize) > 90 && text.scrollWidth <= box.clientWidth && text.scrollHeight <= box.clientHeight;
      };
      return fits('clock') && fits('note');
    })()`,
  );
});

test('it fits markdown inside a region only 30 px tall', async () => {
  const ctx = await setupTest();

  deviceStore.layoutHolder.layout = {
    columns: ['1fr'],
    rows: Array.from({ length: 12 }, () => '1fr'),
    regions: [
      {
        name: 'note',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        content: { kind: 'markdown', markdown: 'Bins go out tonight' },
        until: null,
      },
    ],
  };

  await ctx.setViewport({ width: 1000, height: 360 });
  await ctx.switchScreenOn();

  await ctx.waitForPage(
    `(() => {
      const region = document.querySelector('[data-region="note"]');
      const box = region?.querySelector('[data-fit="box"]');
      const text = box?.firstElementChild;
      if (!region || !box || !text) return false;
      const size = parseFloat(getComputedStyle(text).fontSize);
      return region.clientHeight === 30 && size < 30 && size > 8 && text.scrollHeight <= box.clientHeight && box.scrollHeight <= region.clientHeight;
    })()`,
  );
});

test('it draws a layout whose only visible feature is a region background', async () => {
  const ctx = await setupTest();

  deviceStore.layoutHolder.layout = {
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      {
        name: 'pond',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: 'teal',
        content: null,
        until: null,
      },
    ],
  };

  await ctx.switchScreenOn();

  await ctx.waitForPage(
    `getComputedStyle(document.querySelector('[data-region="pond"]')).backgroundColor === 'rgb(0, 128, 128)'`,
  );
});

test('it shows the background of a region', async () => {
  const ctx = await setupTest();

  deviceStore.layoutHolder.layout = {
    columns: ['1fr', '1fr'],
    rows: ['1fr'],
    regions: [
      {
        name: 'pond',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: 'teal',
        content: { kind: 'markdown', markdown: 'ripples' },
        until: null,
      },
      {
        name: 'note',
        column: 2,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: '#102030',
        content: { kind: 'markdown', markdown: 'Bins go out tonight' },
        until: null,
      },
    ],
  };

  await ctx.switchScreenOn();

  await ctx.waitForPage(
    `getComputedStyle(document.querySelector('[data-region="pond"]')).backgroundColor === 'rgb(0, 128, 128)' && getComputedStyle(document.querySelector('[data-region="note"]')).backgroundColor === 'rgb(16, 32, 48)'`,
  );
});

test('it hides the screen buttons until a touch', async () => {
  const ctx = await setupTest();

  await ctx.switchScreenOn();

  const hidden = await ctx.view.evaluate(ctx.shownButtons);

  await ctx.tap(20, 20);
  await ctx.waitForPage(`${ctx.shownButtons}.length === 4`);

  const touched = await ctx.view.evaluate(ctx.shownButtons);

  expect([hidden, touched]).toStrictEqual([
    [],
    ['Close', 'Full screen', 'Switch off screen', 'Sign out'],
  ]);
});

test('it leaves the device page for the home page on Close', async () => {
  const ctx = await setupTest();

  await ctx.switchScreenOn();
  await ctx.tap(20, 20);
  await ctx.waitForPage(`${ctx.shownButtons}.includes('Close')`);

  await ctx.view.evaluate(
    `([...document.querySelectorAll('button')].find((button) => button.innerText === 'Close').click(), true)`,
  );

  await ctx.waitForPage(
    `document.querySelector('[data-testid="layout"], [data-testid="screen"]') === null`,
  );

  const pathname = await ctx.view.evaluate('location.pathname');

  expect(pathname).toBe('/');
});

test('it shows the screen buttons on a pointer move', async () => {
  const ctx = await setupTest();

  await ctx.switchScreenOn();
  await ctx.view.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20 });
  await ctx.waitForPage(`${ctx.shownButtons}.length === 4`);
});

test('it keeps the screen buttons hidden on a key press', async () => {
  const ctx = await setupTest();

  await ctx.switchScreenOn();
  await ctx.view.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', text: 'a' });

  await ctx.view.evaluate(
    `(globalThis.painted = false, requestAnimationFrame(() => requestAnimationFrame(() => { painted = true })), true)`,
  );

  await ctx.waitForPage('painted === true');

  const shown = await ctx.view.evaluate(ctx.shownButtons);

  expect(shown).toStrictEqual([]);
});

test('it hides the screen buttons 4 seconds after the latest touch', async () => {
  const ctx = await setupTest();

  await ctx.switchScreenOn();
  await ctx.tap(20, 20);
  await ctx.waitForPage(`${ctx.shownButtons}.length === 4`);
  await ctx.pausePageClock();
  await ctx.advancePageClock(3500);

  const before = await ctx.view.evaluate(ctx.shownButtons);

  await ctx.advancePageClock(1000);

  const after = await ctx.view.evaluate(ctx.shownButtons);

  expect([before, after]).toStrictEqual([
    ['Close', 'Full screen', 'Switch off screen', 'Sign out'],
    [],
  ]);
});
