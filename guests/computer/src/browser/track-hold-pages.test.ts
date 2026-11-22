import { expect, onTestFinished, test } from 'bun:test';
import { chromium } from 'playwright-core';
import { makeOriginLog } from '../takeover/make-origin-log';
import { trackHoldPages } from './track-hold-pages';
import type { BrowserState } from './types';

const hasChromium = await chromium.launch({ headless: true }).then(
  async (browser) => {
    await browser.close();

    return true;
  },
  () => false,
);

async function setupTest() {
  const browser = await chromium.launch({ headless: true });

  onTestFinished(async () => {
    await browser.close();
  });

  const context = await browser.newContext();

  await context.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><title>page</title>page</html>' }),
  );

  const state: BrowserState = {
    context,
    tabs: new Map(),
    counter: 0,
    isOpening: false,
    isDiskNew: false,
  };

  const log = makeOriginLog();

  await trackHoldPages(state, log);

  return {
    state,
    log,
    openPage: async (url: string) => {
      const page = await context.newPage();

      await page.goto(url);

      return page;
    },
  };
}

test.skipIf(!hasChromium)(
  'it lists a tab that comes into view without navigating, in the order shown',
  async () => {
    const ctx = await setupTest();
    const first = await ctx.openPage('http://one.test/a');
    const second = await ctx.openPage('http://two.test/b');

    ctx.log.begin(null);

    await first.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
    await second.evaluate("document.dispatchEvent(new Event('visibilitychange'))");

    // the binding answers asynchronously, so a third call that comes back after it has seen both
    await first.evaluate('1');

    expect(ctx.log.end()).toStrictEqual(['http://one.test', 'http://two.test']);
  },
);

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
