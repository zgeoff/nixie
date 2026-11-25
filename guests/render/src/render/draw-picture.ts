import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RenderReply, RenderRequest } from '@heynixie/wire';
import { renderEntryPath } from '@heynixie/wire';
import { chromium } from 'playwright-core';
import { readPageFile, renderOrigin } from './read-page-file';

// the page sets this flag on `window` once its text has fitted its regions
const readyFlag = '__nixieReady';
const readyTimeoutMs = 10_000;

// Opens the request's files as a page at the screen's CSS size and pixel ratio, in a browser that
// starts on an empty profile and fetches nothing, and returns a picture of the page that is exactly
// the request's width and height in pixels.
export async function drawPicture(request: RenderRequest): Promise<RenderReply> {
  const profile = await mkdtemp(join(tmpdir(), 'nixie-render-'));

  const refused: string[] = [];

  try {
    const context = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: {
        width: Math.ceil(request.width / request.pixelRatio),
        height: Math.ceil(request.height / request.pixelRatio),
      },
      deviceScaleFactor: request.pixelRatio,
      serviceWorkers: 'block',
      args: ['--disable-quic', '--hide-scrollbars', '--force-color-profile=srgb'],
    });

    try {
      await context.routeWebSocket('**/*', (socket) => socket.close({ code: 1008 }));

      await context.route('**/*', async (route) => {
        const file = readPageFile(request.files, route.request().url());

        if (file === null) {
          refused.push(route.request().url());

          await route.abort('blockedbyclient');

          return;
        }

        await route.fulfill({
          status: 200,
          contentType: file.mediaType,
          body: Buffer.from(file.base64, 'base64'),
        });
      });

      const page = await context.newPage();

      await page.goto(`${renderOrigin}${renderEntryPath}`, { waitUntil: 'load' });

      await page.waitForFunction(`window.${readyFlag} === true`, undefined, {
        timeout: readyTimeoutMs,
      });

      // The viewport takes whole CSS pixels, so a width that the ratio does not divide leaves it a
      // pixel wider than the picture. A clip cuts the picture to the exact size. Its scale is
      // required, and the picture comes out at CSS size times the scale, so it takes the ratio.
      const session = await context.newCDPSession(page);

      const shot = await session.send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: 0,
          y: 0,
          width: request.width / request.pixelRatio,
          height: request.height / request.pixelRatio,
          scale: request.pixelRatio,
        },
      });

      return { kind: 'picture', base64: shot.data, refused };
    } finally {
      await context.close();
    }
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}
