import { expect, onTestFinished, test } from 'bun:test';
import type { PageData } from '@heynixie/contract';
import { waitForCondition } from '@heynixie/testing';
import { buildPreviewPage } from './build-preview-page';

// The preview's files open in a real Chrome, as the render sandbox opens them: the page runs in
// its sealed frame with the real bridge, and the picture shows what the page drew.
function setupTest() {
  const view = new Bun.WebView({ backend: 'chrome' });
  const decoder = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
    decoder.close();
  });

  return {
    // the colour of the middle of the screen once the preview's script has run
    readMiddleColour: async (html: string, retained: PageData) => {
      const files = buildPreviewPage({
        surface: {
          kind: 'layout',
          layout: {
            layoutID: 'ly3k7m2q9x',
            columns: ['1fr'],
            rows: ['1fr'],
            regions: [
              {
                name: 'pond',
                column: 1,
                row: 1,
                columnSpan: 1,
                rowSpan: 1,
                background: null,
                shown: {
                  shownID: 'sh3k7m2q9x',
                  sequence: 5,
                  untilMs: null,
                  content: { kind: 'html', html },
                },
              },
            ],
          },
        },
        images: new Map(),
        retained: new Map([['pond', retained]]),
        nowMs: Date.parse('2026-11-21T08:05:09.000Z'),
        timeZone: 'UTC',
      });

      const answerRequest = (request: Request): Response => {
        const path = new URL(request.url).pathname.slice(1);

        const file = files.find(
          (candidate) => candidate.path === (path === '' ? 'index.html' : path),
        );

        return file === undefined
          ? new Response('not found', { status: 404 })
          : new Response(Buffer.from(file.base64, 'base64'), {
              headers: { 'content-type': file.mediaType },
            });
      };

      const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerRequest });

      onTestFinished(() => server.stop(true));

      await view.navigate(`http://127.0.0.1:${String(server.port)}/`);

      await waitForCondition(async () => (await view.evaluate('window.__nixieReady')) === true);

      await decoder.navigate('about:blank');

      let colour: unknown = [];

      await waitForCondition(
        async () => {
          const picture = await view.screenshot({ format: 'png' });
          const bytes = await picture.arrayBuffer();

          const shot = Buffer.from(bytes).toString('base64');

          colour = await decoder.evaluate(`(async () => {
            const blob = await (await fetch('data:image/png;base64,${shot}')).blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);
            return Array.from(context.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1).data);
          })()`);

          return JSON.stringify(colour) !== JSON.stringify([0, 0, 0, 255]);
        },
        { intervalMs: 100, timeoutMs: 6000 },
      );

      return colour;
    },
  };
}

test('it draws the page a region holds, which the real bridge hands its retained message', async () => {
  const ctx = await setupTest();

  const colour = await ctx.readMiddleColour(
    `<script>nixie.onMessage((data) => { document.documentElement.style.background = data.fill; });</script>`,
    { fill: 'rgb(255, 0, 0)' },
  );

  expect(colour).toStrictEqual([255, 0, 0, 255]);
});
