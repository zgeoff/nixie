import { expect, onTestFinished, test } from 'bun:test';
import { buildMockRenderRequest, readPNGSize, startLoopbackProbe } from '@heynixie/wire/test-utils';
import { drawPicture } from './draw-picture';

test('it draws a picture at the CSS size times the pixel ratio', async () => {
  const reply = await drawPicture(
    buildMockRenderRequest({ width: 936, height: 702, pixelRatio: 2 }),
  );

  const size = reply.kind === 'picture' ? readPNGSize(Buffer.from(reply.base64, 'base64')) : reply;

  expect(size).toStrictEqual({ width: 1872, height: 1404 });
});

test('it draws a picture of a screen larger than any real one', async () => {
  const reply = await drawPicture(
    buildMockRenderRequest({ width: 4000, height: 3000, pixelRatio: 2 }),
  );

  const size = reply.kind === 'picture' ? readPNGSize(Buffer.from(reply.base64, 'base64')) : reply;

  expect(size).toStrictEqual({ width: 8000, height: 6000 });
});

test('it fetches nothing for a page that asks for a URL of its own', async () => {
  const probe = startLoopbackProbe();

  onTestFinished(() => {
    probe.stop();
  });

  const script = `fetch(${JSON.stringify(probe.url)}).catch(() => {}).finally(() => { window.__nixieReady = true; });`;

  const reply = await drawPicture(buildMockRenderRequest({ script }));

  const refused = reply.kind === 'picture' ? reply.refused : null;

  expect({ hits: probe.hits, refused }).toStrictEqual({ hits: [], refused: [probe.url] });
});
