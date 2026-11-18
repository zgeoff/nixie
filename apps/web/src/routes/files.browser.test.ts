import { expect, onTestFinished, test } from 'bun:test';
import { store } from '../mocks/store';
import { seedCodeRunFiles } from '../test-utils/seed-code-run-files';
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

  const session = await store.sessions.create({});

  const open = async (path: string) => {
    await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

    await view.navigate(`${app.url}${path}`);
  };

  return { api, view, open };
}

test('it shows each file newest first with its task and the sent mark', async () => {
  const ctx = await setupTest();

  await seedCodeRunFiles();

  await ctx.open('/files');

  await waitForPage(ctx.view, "document.body.innerText.includes('beds.csv')");

  const tiles: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('li')].map((tile) => tile.innerText)",
  );

  expect(tiles).toStrictEqual([
    expect.stringContaining('revenue.png'),
    expect.stringContaining('orders.csv'),
    expect.stringMatching(/beds\.csv[\s\S]*Garden plan/u),
  ]);

  const sent: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('li')].filter((tile) => tile.innerText.includes('Sent to you')).map((tile) => tile.innerText.includes('revenue.png'))",
  );

  expect(sent).toStrictEqual([true]);
});

test('it keeps the filter in the address and lists only the files of its kind', async () => {
  const ctx = await setupTest();

  await seedCodeRunFiles();

  await ctx.open('/files');

  await waitForPage(ctx.view, "document.body.innerText.includes('beds.csv')");

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.textContent === 'Other files').click()",
  );

  await waitForPage(ctx.view, "!document.body.innerText.includes('revenue.png')");

  const search: unknown = await ctx.view.evaluate('location.search');

  expect(search).toBe('?kind=other');
});

test('it downloads a file through a link that holds a blob', async () => {
  const ctx = await setupTest();

  await seedCodeRunFiles();

  await ctx.open('/files');

  await waitForPage(ctx.view, "document.body.innerText.includes('orders.csv')");

  await ctx.view.evaluate(`(() => {
    window.downloads = [];
    HTMLAnchorElement.prototype.click = function () {
      const name = this.download;
      const read = fetch(this.href).then((response) => response.text());
      window.downloads.push(read.then((text) => ({ name, text })));
    };
  })()`);

  await ctx.view.click('button[aria-label="Download orders.csv"]');

  await waitForPage(ctx.view, 'window.downloads.length === 1');

  const downloads: unknown = await ctx.view.evaluate('Promise.all(window.downloads)');

  expect(downloads).toStrictEqual([{ name: 'orders.csv', text: 'a,b\n' }]);
});

test('it removes every tile of a code run when one of its files is forgotten', async () => {
  const ctx = await setupTest();

  await seedCodeRunFiles();

  await ctx.open('/files');

  await waitForPage(ctx.view, "document.body.innerText.includes('orders.csv')");

  await ctx.view.evaluate(
    "[...document.querySelectorAll('li')].find((tile) => tile.innerText.includes('orders.csv')).querySelector('button:last-of-type').click()",
  );

  await waitForPage(ctx.view, "document.body.innerText.includes('Forget for good')");

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.textContent === 'Forget for good').click()",
  );

  await waitForPage(
    ctx.view,
    "!document.body.innerText.includes('orders.csv') && !document.body.innerText.includes('revenue.png')",
  );

  const tiles: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('li')].map((tile) => tile.innerText)",
  );

  expect(tiles).toStrictEqual([expect.stringContaining('beds.csv')]);
});
