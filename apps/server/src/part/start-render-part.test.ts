import { expect, onTestFinished, test } from 'bun:test';
import { startTestDevices } from '@heynixie/devices/test-utils';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { buildMockRenderRequest, readPNGSize, startLoopbackProbe } from '@heynixie/wire/test-utils';
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

  const render = await startRenderPart({
    options: { images: { render: { name: 'render', ref: 'render' } }, cleanup },
    adapter,
  });

  return {
    render,
    probeSandboxGone: async () => {
      const left = await testRecorder.recorder.list('process', 'device_render');

      return left.length === 0;
    },
  };
}

test('it draws a preview at the size of a device of 1872 by 1404 pixels at a pixel ratio of 2', async () => {
  const ctx = await setupTest();

  const devices = await startTestDevices({
    preview: { draw: ctx.render.draw, imageLongEdge: 4000, timeZone: 'UTC' },
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
    size: { width: 1872, height: 1404 },
  });
});

test('it makes no network request for a page that asks for a URL of its own', async () => {
  const ctx = await setupTest();

  const probe = startLoopbackProbe();

  onTestFinished(() => {
    probe.stop();
  });

  const script = `fetch(${JSON.stringify(probe.url)}).catch(() => {}).finally(() => { window.__nixieReady = true; });`;

  const outcome = await ctx.render.draw(buildMockRenderRequest({ script }));

  const refused = outcome.kind === 'picture' ? outcome.refused : null;

  expect({ hits: probe.hits, refused }).toStrictEqual({ hits: [], refused: [probe.url] });
});
