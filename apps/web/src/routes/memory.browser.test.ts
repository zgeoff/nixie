import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { clickPageButton } from '../test-utils/click-page-button';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

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

  return {
    appURL: app.url,
    view,
    clickButton: (label: string) => clickPageButton(view, label),
    waitForPage: (expression: string) => waitForPage(view, expression),
  };
}

test('it opens the item a notice links to at the top of the memory page', async () => {
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
});

test('it keeps the forget retry offered when the forget of an item replies pending', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.memoryItems.create({
    failsForgetCleanup: true,
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps bees' }],
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/memory`);
  await ctx.clickButton('Forget');
  await ctx.clickButton('Forget for good');

  await ctx.waitForPage(
    `document.body.innerText.includes('The forget did not finish. Try again.')`,
  );

  const isRetryOffered: unknown = await ctx.view.evaluate(
    `[...document.querySelectorAll('button')].some(
      (button) => button.innerText.trim() === 'Forget for good' && !button.disabled,
    )`,
  );

  expect(isRetryOffered).toBe(true);
});

test('it keeps the finish offered when a bulk forget of retired items replies with one pending', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.memoryItems.create({
    shortID: 'r7tq2w',
    state: 'retired',
    versions: [{ text: 'Owns a red canoe' }],
  });

  await store.memoryItems.create({
    failsForgetCleanup: true,
    shortID: 'p2vb8m',
    state: 'retired',
    versions: [{ text: 'Plays the oboe badly' }],
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/memory`);
  await ctx.clickButton('Forget retired items');
  await ctx.clickButton('Forget 2 items for good');

  await ctx.waitForPage(
    `document.body.innerText.includes('1 item forgotten, 1 item still pending.')`,
  );

  await ctx.waitForPage(
    `[...document.querySelectorAll('button')].some(
      (button) => button.innerText.trim() === 'Finish the forget' && !button.disabled,
    )`,
  );
});
