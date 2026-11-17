import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { spendStore } from '../mocks/spend-store';
import { store } from '../mocks/store';
import { buildMockSpendTrip } from '../test-utils/build-mock-spend-trip';
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

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return {
    appURL: app.url,
    view,
    readPageText: () => view.evaluate('document.body.innerText'),
  };
}

test('it shows the stop notice, then raises the limit with one confirm', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await spendStore.stops.create({ stop: buildMockSpendTrip() });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitForPage(
    ctx.view,
    "[...document.querySelectorAll('button')].some((button) => button.textContent === \"Raise today's limit\")",
  );

  const text = await ctx.readPageText();

  expect(text).toInclude('Model spending stopped: the daily limit of $60 was reached');

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.textContent === \"Raise today's limit\").click()",
  );

  await waitForPage(
    ctx.view,
    "[...document.querySelectorAll('button')].some((button) => button.textContent === 'Confirm raise')",
  );

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.textContent === 'Confirm raise').click()",
  );

  await waitFor(
    () => {
      expect(spendStore.raises.all()).toMatchObject([{ start: '2026-11-13', dollars: 90 }]);
    },
    { timeout: 10_000 },
  );
});
