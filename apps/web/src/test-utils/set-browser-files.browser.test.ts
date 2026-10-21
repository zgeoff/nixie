import { expect, mock, onTestFinished, test } from 'bun:test';
import { checkBrowserSkip } from './check-browser-skip';
import { setBrowserFiles } from './set-browser-files';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const answerRequest = mock(
    () =>
      new Response('<!doctype html><input id="picker" type="file" multiple>', {
        headers: { 'content-type': 'text/html' },
      }),
  );

  const page = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await page.stop(true);
  });

  // Chrome's sandbox needs user namespaces that a container or a root user lacks.
  const view = new Bun.WebView({ backend: { argv: ['--no-sandbox'], type: 'chrome', url: false } });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate(`http://127.0.0.1:${page.port}/`);

  return { view };
}

test.skipIf(browserSkip.isSkipped)(
  'it sets the files on the input, with their names and bytes, as a pick does',
  async () => {
    const ctx = await setupTest();

    await setBrowserFiles(ctx.view, {
      selector: '#picker',
      files: [
        { name: 'swatch.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
        { name: 'tile.jpg', bytes: new Uint8Array([0xff, 0xd8]) },
      ],
    });

    const picked: unknown = await ctx.view.evaluate(`Promise.all(
    [...document.querySelector('#picker').files].map(async (file) => [file.name, [...new Uint8Array(await file.arrayBuffer())]]),
  )`);

    expect(picked).toStrictEqual([
      ['swatch.png', [0x89, 0x50, 0x4e, 0x47]],
      ['tile.jpg', [0xff, 0xd8]],
    ]);
  },
);

test.skipIf(browserSkip.isSkipped)('it refuses a page that never shows the input', async () => {
  const ctx = await setupTest();

  const set = setBrowserFiles(ctx.view, {
    selector: '#missing',
    timeoutMs: 200,
    files: [{ name: 'swatch.png', bytes: new Uint8Array([0x89]) }],
  });

  await Promise.allSettled([set]);

  expect(set).rejects.toThrowWithMessage(Error, /^the page shows no #missing/u);
});
