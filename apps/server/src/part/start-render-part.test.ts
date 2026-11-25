import { expect, onTestFinished, test } from 'bun:test';
import { imageLimits } from '@heynixie/contract';
import { startTestDevices } from '@heynixie/devices/test-utils';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { buildMockRenderRequest, readPNGSize, startLoopbackProbe } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { createSandboxAdapter } from '../sandbox/create-sandbox-adapter';
import { buildCleanup } from '../server/build-cleanup';
import { startRenderPart } from './start-render-part';

async function setupTest() {
  const cleanup = buildCleanup();

  // onTestFinished runs its callbacks first in, first out, so the sandboxes stop while the
  // recorder's writer still runs
  onTestFinished(() => cleanup.stop());

  const testRecorder = await setupTestRecorder();

  const adapter = createSandboxAdapter({
    recorder: testRecorder.recorder,
    toolTarget: () => ({ path: '/nonexistent.sock' }),
    sandbox: { adapter: 'test' },
    testRootDir: testRecorder.log.writer.dataDir,
    hostEnv: {},
  });

  return {
    adapter,
    cleanup,
    startRender: () =>
      startRenderPart({
        options: { images: { render: { name: 'render', ref: 'render' } }, cleanup },
        adapter,
      }),
    probeSandboxGone: async () => {
      const left = await testRecorder.recorder.list('process', 'device_render');

      return left.length === 0;
    },
  };
}

test('it draws a preview of a device of 1872 by 1404 pixels at a pixel ratio of 2 for the model', async () => {
  const ctx = await setupTest();
  const render = await ctx.startRender();

  invariant(render !== null);

  const devices = await startTestDevices({
    preview: { draw: render.draw, imageLongEdge: imageLimits.longEdge, timeZone: 'UTC' },
  });

  const device = await devices.seed.screenOnDevice();

  devices.streams.open(device.deviceID, { width: 1872, height: 1404, pixelRatio: 2 });

  await devices.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'note', column: 1, row: 1, background: 'teal' },
      { name: 'clock', column: 2, row: 1 },
    ],
  });

  await devices.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  const outcome = await devices.call('device.preview', { device: device.deviceID });

  await waitForCondition(ctx.probeSandboxGone);

  const picture = outcome.status === 'ok' ? outcome.images?.[0] : undefined;

  expect({
    result: outcome.status === 'ok' ? outcome.result : null,
    size: picture === undefined ? null : readPNGSize(picture.bytes),
  }).toStrictEqual({
    result: {
      device: device.deviceID,
      width: 1872,
      height: 1404,
      pixelRatio: 2,
      errors: [],
      picture: 'shown',
    },
    size: { width: 1568, height: 1176 },
  });
});

test('it draws a picture of a device of 8000 by 6000 pixels', async () => {
  const ctx = await setupTest();
  const render = await ctx.startRender();

  invariant(render !== null);

  const devices = await startTestDevices({
    preview: { draw: render.draw, imageLongEdge: imageLimits.longEdge, timeZone: 'UTC' },
  });

  const device = await devices.seed.screenOnDevice();

  devices.streams.open(device.deviceID, { width: 8000, height: 6000, pixelRatio: 2 });

  const outcome = await devices.call('device.preview', { device: device.deviceID });

  expect(outcome).toMatchObject({ result: { picture: 'shown' } });
});

test('it draws a render at the exact pixel size of a device of an odd width', async () => {
  const ctx = await setupTest();
  const render = await ctx.startRender();

  invariant(render !== null);

  const outcome = await render.draw(
    buildMockRenderRequest({ width: 1873, height: 1404, pixelRatio: 2 }),
  );

  const size = outcome.kind === 'picture' ? readPNGSize(outcome.png) : outcome;

  expect(size).toStrictEqual({ width: 1873, height: 1404 });
});

test('it starts no render sandbox for a manifest that holds no render image', async () => {
  const ctx = await setupTest();

  const render = await startRenderPart({
    options: { images: {}, cleanup: ctx.cleanup },
    adapter: ctx.adapter,
  });

  expect(render).toBeNull();
});

test('it makes no network request for a page that asks for a URL of its own', async () => {
  const ctx = await setupTest();
  const render = await ctx.startRender();

  invariant(render !== null);

  const probe = startLoopbackProbe();

  onTestFinished(() => {
    probe.stop();
  });

  const script = `fetch(${JSON.stringify(probe.url)}).catch(() => {}).finally(() => { window.__nixieReady = true; });`;

  const outcome = await render.draw(buildMockRenderRequest({ script }));

  const refused = outcome.kind === 'picture' ? outcome.refused : null;

  expect({ hits: probe.hits, refused }).toStrictEqual({ hits: [], refused: [probe.url] });
});
