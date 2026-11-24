import { expect, onTestFinished, test } from 'bun:test';
import { chromium } from 'playwright-core';
import { makeOriginLog } from '../takeover/make-origin-log';
import { trackHoldPages } from './track-hold-pages';
import type { BrowserState } from './types';

const hasChromium = await chromium
  .launch({ headless: true })
  .catch(() => null)
  .then(async (browser) => {
    if (browser === null) {
      return false;
    }

    await browser.close();

    return true;
  });

async function setupTest() {
  const browser = await chromium.launch({ headless: true });

  onTestFinished(async () => {
    await browser.close();
  });

  const context = await browser.newContext();

  await context.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: route.request().url().endsWith('/opener')
        ? `<html><body><button style="width:200px;height:100px" onclick="window.open('http://popup.test/terms')">open</button></body></html>`
        : '<html><title>page</title>page</html>',
    }),
  );

  const state: BrowserState = {
    context,
    tabs: new Map(),
    counter: 0,
    isOpening: false,
    isDiskNew: false,
  };

  const log = makeOriginLog();
  const arrivals = Array.from({ length: 4 }, () => Promise.withResolvers<void>());
  const popupArrival = Promise.withResolvers<void>();
  const seen = { count: 0 };

  trackHoldPages(state, {
    ...log,
    record: (url) => {
      log.record(url);
      arrivals[seen.count]?.resolve();
      seen.count += 1;

      if (url.startsWith('http://popup.test')) {
        popupArrival.resolve();
      }
    },
  });

  return {
    state,
    log,

    // settles once the guest has been told of that many pages in view since the page was set up
    reported: (number: number) => arrivals[number - 1]?.promise,
    popupReported: popupArrival.promise,
    openPage: async (url: string) => {
      const page = await context.newPage();

      await page.goto(url);

      return page;
    },
  };
}

test.skipIf(!hasChromium)('it lists the site of each page a hold navigates, in order', async () => {
  const ctx = await setupTest();
  const page = await ctx.openPage('http://one.test/a');

  await ctx.reported(1);

  ctx.log.begin(page.url());

  await page.goto('http://two.test/b');
  await ctx.reported(2);

  expect(ctx.log.end()).toStrictEqual(['http://one.test', 'http://two.test']);
});

test.skipIf(!hasChromium)('it lists no site for a page that says it came into view', async () => {
  const ctx = await setupTest();
  const first = await ctx.openPage('http://one.test/a');
  const second = await ctx.openPage('http://two.test/b');

  await ctx.reported(2);

  ctx.log.begin(second.url());

  await first.evaluate(
    "document.dispatchEvent(new Event('visibilitychange')); globalThis.nixieShown?.()",
  );

  // a navigation after the claim proves the tracker has seen everything before it
  await second.goto('http://three.test/c');
  await ctx.reported(3);

  expect(ctx.log.end()).toStrictEqual(['http://two.test', 'http://three.test']);
});

test.skipIf(!hasChromium)(
  'it adds a tab that a person opens during a hold, and drops it when it closes',
  async () => {
    const ctx = await setupTest();

    ctx.log.begin(null);

    const page = await ctx.openPage('http://opened.test/');

    const tabsWhileOpen = [...ctx.state.tabs.values()].map((tab) => tab.page);

    await page.close();

    expect([tabsWhileOpen, [...ctx.state.tabs.values()]]).toStrictEqual([[page], []]);
  },
);

test.skipIf(!hasChromium)('it adds no tab when no hold is open', async () => {
  const ctx = await setupTest();

  await ctx.openPage('http://opened.test/');

  expect(ctx.state.tabs.size).toBe(0);
});

test.skipIf(!hasChromium)('it leaves a tab that a tool opens to the tool', async () => {
  const ctx = await setupTest();

  ctx.log.begin(null);

  ctx.state.isOpening = true;

  await ctx.openPage('http://opened.test/');

  expect(ctx.state.tabs.size).toBe(0);
});

test.skipIf(!hasChromium)(
  'it lists the site of a tab that a click opened, after the site that was in view',
  async () => {
    const ctx = await setupTest();
    const opener = await ctx.openPage('http://opener.test/opener');

    await ctx.reported(1);

    ctx.log.begin(opener.url());

    const popup = ctx.state.context.waitForEvent('page');

    await opener.mouse.click(100, 50);

    await popup;
    await ctx.popupReported;

    expect(ctx.log.end()).toStrictEqual(['http://opener.test', 'http://popup.test']);
  },
);
