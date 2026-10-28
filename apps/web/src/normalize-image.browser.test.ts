import { expect, onTestFinished, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { checkBrowserSkip } from './test-utils/check-browser-skip';
import { createBrowserView } from './test-utils/create-browser-view';
import { findBrowserRun } from './test-utils/find-browser-run';
import { runInPage } from './test-utils/run-in-page';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const run = findBrowserRun(process.env);

  invariant(run !== null, 'the browser preload refuses a process with no browser run');

  // The page code imports the module by its source path, which the page resolves against its own
  // URL, so the server answers that path with the lane's bundle of the module.
  const answerRequest = (request: Request) =>
    new URL(request.url).pathname === '/normalize-image'
      ? new Response(Bun.file(run.normalizeImagePath), {
          headers: { 'content-type': 'text/javascript' },
        })
      : new Response('<!doctype html><title>images</title>', {
          headers: { 'content-type': 'text/html' },
        });

  const page = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await page.stop(true);
  });

  const view = createBrowserView();

  onTestFinished(() => {
    view.close();
  });

  await view.navigate(`http://127.0.0.1:${page.port}/`);

  return { view };
}

test.skipIf(browserSkip.isSkipped)(
  'it scales a large photo to a long edge of 1568 px and drops its EXIF data, location included',
  async () => {
    const ctx = await setupTest();

    const result = await runInPage(
      ctx.view,
      async () => {
        const canvas = new OffscreenCanvas(3000, 2000);

        const context = canvas.getContext('2d');

        if (context === null) {
          throw new Error('the page has no 2D canvas');
        }

        context.fillStyle = '#4a7';

        context.fillRect(0, 0, 3000, 2000);

        const jpeg = await canvas.convertToBlob({ type: 'image/jpeg' });
        const jpegBytes = await jpeg.arrayBuffer();

        const photo = new Uint8Array(jpegBytes);
        const payload = new TextEncoder().encode('Exif\0\0GPS-51.4778N-0.0014W');

        const segment = new Uint8Array([
          0xff,
          0xe1,
          (payload.length + 2) >> 8,
          (payload.length + 2) & 255,
          ...payload,
        ]);

        const tagged = new Uint8Array([...photo.slice(0, 2), ...segment, ...photo.slice(2)]);

        const imported = await import('./normalize-image');

        const image = await imported.normalizeImage(
          new File([tagged], 'garden.jpg', { type: 'image/jpeg' }),
        );

        const bitmap = await createImageBitmap(image);
        const imageBytes = await image.arrayBuffer();

        const text = new TextDecoder('latin1').decode(imageBytes);

        return {
          type: image.type,
          width: bitmap.width,
          height: bitmap.height,
          hadTag: new TextDecoder('latin1').decode(tagged).includes('GPS-51.4778N'),
          hasExif: text.includes('Exif'),
          hasTag: text.includes('GPS-51.4778N'),
        };
      },
      null,
      z.object({
        type: z.string(),
        width: z.number(),
        height: z.number(),
        hadTag: z.boolean(),
        hasExif: z.boolean(),
        hasTag: z.boolean(),
      }),
    );

    expect(result).toStrictEqual({
      type: 'image/jpeg',
      width: 1568,
      height: 1045,
      hadTag: true,
      hasExif: false,
      hasTag: false,
    });
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it keeps a small screenshot at its size, as a PNG',
  async () => {
    const ctx = await setupTest();

    const result = await runInPage(
      ctx.view,
      async () => {
        const canvas = new OffscreenCanvas(800, 600);

        const context = canvas.getContext('2d');

        if (context === null) {
          throw new Error('the page has no 2D canvas');
        }

        context.fillRect(10, 10, 100, 100);

        const screenshot = await canvas.convertToBlob({ type: 'image/png' });
        const imported = await import('./normalize-image');

        const image = await imported.normalizeImage(
          new File([screenshot], 'screen.png', { type: 'image/png' }),
        );

        const bitmap = await createImageBitmap(image);

        return { type: image.type, width: bitmap.width, height: bitmap.height };
      },
      null,
      z.object({ type: z.string(), width: z.number(), height: z.number() }),
    );

    expect(result).toStrictEqual({ type: 'image/png', width: 800, height: 600 });
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it refuses bytes the browser cannot decode with an unreadable-image error',
  async () => {
    const ctx = await setupTest();

    const result = await runInPage(
      ctx.view,
      async () => {
        const imported = await import('./normalize-image');

        return imported
          .normalizeImage(
            new File([new TextEncoder().encode('not an image')], 'notes.png', {
              type: 'image/png',
            }),
          )
          .then(
            () => 'decoded',
            (error: unknown) => (error instanceof Error ? error.name : 'no error'),
          );
      },
      null,
      z.string(),
    );

    expect(result).toBe('ImageUnreadableError');
  },
);
