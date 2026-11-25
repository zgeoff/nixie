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
// starts on an empty profile and fetches nothing, and returns a picture of the page.
export async function drawPicture(request: RenderRequest): Promise<RenderReply> {
  const profile = await mkdtemp(join(tmpdir(), 'nixie-render-'));

  const refused: string[] = [];

  try {
    const context = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: request.width, height: request.height },
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

      const picture = await page.screenshot({ type: 'png' });

      return { kind: 'picture', base64: picture.toString('base64'), refused };
    } finally {
      await context.close();
    }
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}
