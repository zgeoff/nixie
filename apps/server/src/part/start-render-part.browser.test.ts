import { expect, onTestFinished, test } from 'bun:test';
import { startTestDevices } from '@heynixie/devices/test-utils';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import invariant from 'tiny-invariant';
import { createSandboxAdapter } from '../sandbox/create-sandbox-adapter';
import { buildCleanup } from '../server/build-cleanup';
import { startRenderPart } from './start-render-part';

// The preview runs through the real render guest, which serves the page's frame to its browser.
// Chrome's picture holds no alpha channel, so a Chrome view decodes it.
async function setupTest() {
  const cleanup = buildCleanup();

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

  invariant(render !== null);

  const devices = await startTestDevices({ preview: { draw: render.draw, timeZone: 'UTC' } });

  const decoder = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    decoder.close();
  });

  await decoder.navigate('about:blank');

  return {
    devices,

    // the colour of the middle pixel of a PNG, as red, green, blue and alpha
    readMiddleColour: (png: Uint8Array): Promise<unknown> => {
      const encoded = Buffer.from(png).toString('base64');

      return decoder.evaluate(`(async () => {
        const blob = await (await fetch('data:image/png;base64,${encoded}')).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        return Array.from(context.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1).data);
      })()`);
    },
  };
}

test('it draws the page a region holds in the preview, with its retained message from the bridge', async () => {
  const ctx = await setupTest();
  const device = await ctx.devices.seed.screenOnDevice();

  ctx.devices.streams.open(device.deviceID, { width: 400, height: 300, pixelRatio: 1 });

  await ctx.devices.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.devices.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: {
      kind: 'html',
      html: '<script>nixie.onMessage((data) => { document.documentElement.style.background = data.fill; });</script>',
    },
  });

  await ctx.devices.call('device.sendToPage', {
    device: device.deviceID,
    region: 'pond',
    data: { fill: 'rgb(255, 0, 0)' },
    retain: true,
  });

  const outcome = await ctx.devices.call('device.preview', { device: device.deviceID });

  const picture = outcome.status === 'ok' ? outcome.images?.[0] : undefined;

  invariant(picture !== undefined);

  const colour = await ctx.readMiddleColour(picture.bytes);

  expect(colour).toStrictEqual([255, 0, 0, 255]);
});
