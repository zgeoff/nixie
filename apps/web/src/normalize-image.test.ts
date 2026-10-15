import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import invariant from 'tiny-invariant';

// normalizeImage needs a browser's decoder and canvas, so these tests run it in a headless Chrome or
// Chromium, which Bun finds on PATH, in a standard install location, or at BUN_CHROME_PATH.
async function setupTest() {
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, 'normalize-image.ts')],
    format: 'esm',
    target: 'browser',
  });

  const script = await built.outputs[0]?.text();

  invariant(script !== undefined, 'the build wrote no bundle');

  const page = Bun.serve({
    fetch: (request) =>
      new URL(request.url).pathname === '/normalize-image.js'
        ? new Response(script, { headers: { 'content-type': 'text/javascript' } })
        : new Response('<!doctype html><title>images</title>', {
            headers: { 'content-type': 'text/html' },
          }),
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await page.stop(true);
  });

  // Chrome's sandbox needs user namespaces that a container or a root user lacks, and the browser
  // loads only the page this test serves
  const view = new Bun.WebView({ backend: { argv: ['--no-sandbox'], type: 'chrome', url: false } });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate(`http://127.0.0.1:${page.port}/`);

  return { view };
}

test('it scales a large photo to a long edge of 1568 px and drops its EXIF data, location included', async () => {
  const ctx = await setupTest();

  // a 3000 by 2000 JPEG with an EXIF segment that holds an invented location, after the start marker
  const result: unknown = await ctx.view.evaluate(`(async () => {
    const canvas = new OffscreenCanvas(3000, 2000);
    const context = canvas.getContext('2d');
    context.fillStyle = '#4a7';
    context.fillRect(0, 0, 3000, 2000);
    const photo = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
    const payload = new TextEncoder().encode('Exif\\0\\0GPS-51.4778N-0.0014W');
    const segment = new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
    const tagged = new Uint8Array([...photo.slice(0, 2), ...segment, ...photo.slice(2)]);
    const { normalizeImage } = await import('/normalize-image.js');
    const image = await normalizeImage(new File([tagged], 'garden.jpg', { type: 'image/jpeg' }));
    const bitmap = await createImageBitmap(image);
    const text = new TextDecoder('latin1').decode(await image.arrayBuffer());
    return {
      type: image.type,
      width: bitmap.width,
      height: bitmap.height,
      hadTag: new TextDecoder('latin1').decode(tagged).includes('GPS-51.4778N'),
      hasExif: text.includes('Exif'),
      hasTag: text.includes('GPS-51.4778N'),
    };
  })()`);

  expect(result).toStrictEqual({
    type: 'image/jpeg',
    width: 1568,
    height: 1045,
    hadTag: true,
    hasExif: false,
    hasTag: false,
  });
});

test('it keeps a small screenshot at its size, as a PNG', async () => {
  const ctx = await setupTest();

  const result: unknown = await ctx.view.evaluate(`(async () => {
    const canvas = new OffscreenCanvas(800, 600);
    canvas.getContext('2d').fillRect(10, 10, 100, 100);
    const screenshot = await canvas.convertToBlob({ type: 'image/png' });
    const { normalizeImage } = await import('/normalize-image.js');
    const image = await normalizeImage(new File([screenshot], 'screen.png', { type: 'image/png' }));
    const bitmap = await createImageBitmap(image);
    return { type: image.type, width: bitmap.width, height: bitmap.height };
  })()`);

  expect(result).toStrictEqual({ type: 'image/png', width: 800, height: 600 });
});

test('it refuses bytes the browser cannot decode with an unreadable-image error', async () => {
  const ctx = await setupTest();

  const result: unknown = await ctx.view.evaluate(`(async () => {
    const { normalizeImage } = await import('/normalize-image.js');
    return normalizeImage(new File([new TextEncoder().encode('not an image')], 'notes.png', { type: 'image/png' }))
      .then(() => 'decoded', (error) => error.name);
  })()`);

  expect(result).toBe('ImageUnreadableError');
});
