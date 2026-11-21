import { expect, onTestFinished, test } from 'bun:test';
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

  const session = await store.sessions.create({ deviceName: 'desk panel' });

  await setupSignedInBrowser(view, { appURL: proxy.url, token: session.token });

  return {
    appURL: proxy.url,
    view,
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
