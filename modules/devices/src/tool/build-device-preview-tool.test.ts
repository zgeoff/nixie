import { expect, mock, test } from 'bun:test';
import { encodeTestImage } from '@heynixie/connectors/test-utils';
import { startTestDevices } from '../test-utils';
import type { DevicePreviewOptions } from './device-tool-options';

type Render = DevicePreviewOptions['draw'];

async function setupTest(render?: Render) {
  const picture = await encodeTestImage({ width: 40, height: 30 }, 'png');

  const draw = mock<Render>(() =>
    Promise.resolve({ kind: 'picture' as const, png: new Uint8Array(picture), refused: [] }),
  );

  const ctx = await startTestDevices({
    preview: { draw: render ?? draw, imageLongEdge: 1568, timeZone: 'UTC' },
  });

  const device = await ctx.seed.screenOnDevice();

  const stream = ctx.streams.open(device.deviceID, { width: 1872, height: 1404, pixelRatio: 2 });

  return { ...ctx, device, draw, stream };
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('device.preview', { device: 'zz9plural1' });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a device whose screen is off', async () => {
  const ctx = await setupTest();
  const off = await ctx.seed.device({ name: 'dark panel' });
  const outcome = await ctx.call('device.preview', { device: off.deviceID });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'SCREEN_OFF' });
});

test('it asks for a render at the device CSS size and pixel ratio, an odd size included', async () => {
  const ctx = await setupTest();

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  const request = ctx.draw.mock.calls[0]?.[0];

  expect({
    width: request?.width,
    height: request?.height,
    ratio: request?.pixelRatio,
  }).toStrictEqual({ width: 936, height: 702, ratio: 2 });
});

test("it returns the device's size in pixels and the picture", async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      device: ctx.device.deviceID,
      width: 1872,
      height: 1404,
      pixelRatio: 2,
      errors: [],
      picture: 'shown',
    },
    images: [{ mediaType: 'image/png', bytes: expect.any(Uint8Array) }],
  });
});

test('it draws the regions that hold content into the page it sends', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'note', column: 1, row: 1, background: 'teal' },
      { name: 'clock', column: 2, row: 1 },
    ],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out <script>x</script>' },
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'clock',
    content: { kind: 'live', live: 'clock', format: 'HH:mm' },
  });

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  const request = ctx.draw.mock.calls[0]?.[0];
  const page = Buffer.from(request?.files[0]?.base64 ?? '', 'base64').toString('utf8');

  expect({
    hasNote: page.includes('Bins go out &lt;script&gt;x&lt;/script&gt;'),
    hasTime: page.includes('08:00'),
    hasTeal: page.includes('background-color:teal'),
  }).toStrictEqual({ hasNote: true, hasTime: true, hasTeal: true });
});

test('it returns no picture when no render sandbox is set up', async () => {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1872, height: 1404, pixelRatio: 2 });

  const outcome = await ctx.call('device.preview', { device: device.deviceID });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      device: device.deviceID,
      width: 1872,
      height: 1404,
      pixelRatio: 2,
      errors: [],
      picture: 'unavailable',
    },
    images: [],
  });
});

test('it returns no picture when the render fails', async () => {
  const ctx = await setupTest(() => Promise.resolve({ kind: 'failed', reason: 'no browser' }));
  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toMatchObject({ result: { picture: 'unavailable' }, images: [] });
});

test('it returns the errors that the device reported for the content a region shows now', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Ripples' },
  });

  const layout = await ctx.readLayout(ctx.device.deviceID);

  const shown = layout?.regions[0]?.shown?.shownID ?? '';

  ctx.streams.errors.record(ctx.device.deviceID, {
    region: 'pond',
    shown,
    atMs: Date.parse('2026-11-21T08:00:00.000Z'),
    message: 'TypeError: x is undefined',
  });

  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toMatchObject({
    result: {
      errors: [
        { region: 'pond', at: '2026-11-21T08:00:00.000Z', message: 'TypeError: x is undefined' },
      ],
    },
  });
});

test('it leaves out the errors of content that a region no longer shows', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Ripples' },
  });

  const before = await ctx.readLayout(ctx.device.deviceID);

  ctx.streams.errors.record(ctx.device.deviceID, {
    region: 'pond',
    shown: before?.regions[0]?.shown?.shownID ?? '',
    atMs: 1,
    message: 'old content failed',
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Calm' },
  });

  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toMatchObject({ result: { errors: [] } });
});

test('it still returns the last errors of a device that is offline, with no size and no picture', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Ripples' },
  });

  const layout = await ctx.readLayout(ctx.device.deviceID);

  ctx.streams.errors.record(ctx.device.deviceID, {
    region: 'pond',
    shown: layout?.regions[0]?.shown?.shownID ?? '',
    atMs: Date.parse('2026-11-21T08:00:00.000Z'),
    message: 'boom',
  });

  await ctx.closeStream(ctx.device.deviceID, ctx.stream);

  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toMatchObject({
    result: {
      width: null,
      height: null,
      pixelRatio: null,
      errors: [{ region: 'pond', message: 'boom' }],
      picture: 'unavailable',
    },
  });
});
