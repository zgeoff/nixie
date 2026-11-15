import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

async function setupTest() {
  const hydrated = "Object.keys(document).some((key) => key.startsWith('_reactListening'))";
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({ deviceName: 'laptop' });

  await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

  const waitForPage = (expression: string) =>
    waitFor(
      async () => {
        const holds: unknown = await view.evaluate(expression);

        expect(holds).toBeTrue();
      },
      { timeout: 8000 },
    );

  return {
    view,
    waitForPage,
    openPage: async () => {
      await view.navigate(`${app.url}/mandates`);

      await waitForPage(
        `${hydrated} && document.querySelector('form[aria-label="Propose a mandate"]') !== null`,
      );
    },
  };
}

test('it lists a mandate in force with its rule and ends it with End now', async () => {
  const ctx = await setupTest();

  await store.mandates.create({
    expires: new Date(Date.now() + 60 * 60 * 1000),
    rules: [{ ruleID: 'abc-1', sentence: 'Allow calendar.respond.' }],
    title: 'Full authority over my calendar invites',
  });

  await ctx.openPage();
  await ctx.waitForPage(`document.body.innerText.includes('Allow calendar.respond.')`);
  await ctx.view.click('button[name="end-now"]');
  await ctx.waitForPage(`document.body.innerText.includes('No mandate is in force.')`);

  expect(store.mandates.all()).toStrictEqual([]);
});

test('it proposes a mandate that then waits on the approvals page', async () => {
  const ctx = await setupTest();

  await ctx.openPage();
  await ctx.view.click('input[maxlength="120"]');
  await ctx.view.type('Handle my test sends');
  await ctx.view.click('div[aria-label="Rule 1"] textarea');
  await ctx.view.type('test.send');
  await ctx.view.evaluate(`document.querySelector('button[name="propose"]').click()`);
  await ctx.waitForPage(`document.querySelector('p[role="status"]') !== null`);

  const rows = store.approvalRows.all();

  expect(rows.map((row) => [row.cause, row.state])).toStrictEqual([['mandate', 'pending']]);
});
