import { expect, onTestFinished, test } from 'bun:test';
import { store } from '../mocks/store';
import { seedSentFile } from '../test-utils/seed-sent-file';
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

  const open = async () => {
    await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

    await view.navigate(`${app.url}/`);
  };

  return { api, view, open };
}

test('it shows a sent image inline and opens it full size on a tap', async () => {
  const ctx = await setupTest();

  await store.files.create({
    file: 'p3n8x2c7ke',
    name: 'revenue.png',
    mediaType: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  });

  await store.records.create({ kind: 'task.step_started', sequence: 100 });

  await seedSentFile({
    file: 'p3n8x2c7ke',
    name: 'revenue.png',
    bytes: 48_213,
    mediaType: 'image/png',
    sequence: 101,
  });

  await store.records.create({
    kind: 'model.reply',
    sequence: 103,
    message: { text: 'Here is the chart.' },
  });

  await store.records.create({ kind: 'task.step_committed', sequence: 104 });
  await ctx.open();

  const button = 'button[aria-label="Open revenue.png full size"]';

  await waitForPage(ctx.view, `document.querySelector('${button} img')?.naturalWidth > 0`);

  await ctx.view.click(button);

  await waitForPage(ctx.view, "document.querySelector('dialog[open] img') !== null");

  const dialogSource: unknown = await ctx.view.evaluate(
    "document.querySelector('dialog[open] img').src.slice(0, 5)",
  );

  await ctx.view.click('dialog[open] button');

  await waitForPage(ctx.view, "document.querySelector('dialog[open]') === null");

  expect(dialogSource).toBe('blob:');
});

test('it shows a sent file that is not an image as a chip that reads the file when tapped', async () => {
  const ctx = await setupTest();

  await store.files.create({
    file: 'k7w2m9qa4x',
    name: 'orders.csv',
    mediaType: 'text/csv',
    data: btoa('a,b\n'),
  });

  await store.records.create({ kind: 'task.step_started', sequence: 100 });

  await seedSentFile({
    file: 'k7w2m9qa4x',
    name: 'orders.csv',
    bytes: 812,
    mediaType: 'text/csv',
    sequence: 101,
  });

  await store.records.create({ kind: 'task.step_committed', sequence: 103 });
  await ctx.open();

  const chip = [
    "[...document.querySelectorAll('button')]",
    ".find((button) => button.textContent === 'orders.csv · 812 B')",
  ].join('');

  await waitForPage(ctx.view, `${chip} !== undefined`);

  // The page records each download link that is clicked, with the text its blob holds, and starts
  // no real download.
  await ctx.view.evaluate(`(() => {
    window.downloads = [];
    HTMLAnchorElement.prototype.click = function () {
      const name = this.download;
      const read = fetch(this.href).then((response) => response.text());
      window.downloads.push(read.then((text) => ({ name, text })));
    };
  })()`);

  await ctx.view.evaluate(`${chip}.click()`);

  await waitForPage(ctx.view, `${chip}?.disabled === false && window.downloads.length === 1`);

  const downloads: unknown = await ctx.view.evaluate('Promise.all(window.downloads)');
  const images = await ctx.view.evaluate("document.querySelectorAll('li img').length");

  expect({
    readRequests: ctx.api.requests.filter((request) => request.path === '/rpc/files/read'),
    images,
    downloads,
  }).toStrictEqual({
    readRequests: [expect.objectContaining({ path: '/rpc/files/read' })],
    images: 0,
    downloads: [{ name: 'orders.csv', text: 'a,b\n' }],
  });
});

test('it shows a sent image that a forget made unreadable as forgotten, with no image', async () => {
  const ctx = await setupTest();

  await store.files.create({
    file: 'r4t8w2qz6n',
    name: 'revenue.png',
    mediaType: 'image/png',
    isForgotten: true,
  });

  await store.records.create({ kind: 'task.step_started', sequence: 100 });

  await seedSentFile({
    file: 'r4t8w2qz6n',
    name: 'revenue.png',
    bytes: 48_213,
    mediaType: 'image/png',
    sequence: 101,
  });

  await store.records.create({ kind: 'task.step_committed', sequence: 103 });
  await ctx.open();

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('revenue.png · 47.1 KiB · Forgotten')",
  );

  const images = await ctx.view.evaluate("document.querySelectorAll('li img').length");

  expect(images).toBe(0);
});
