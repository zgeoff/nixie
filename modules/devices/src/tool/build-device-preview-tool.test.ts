import { expect, mock, test } from 'bun:test';
import { encodeTestImage } from '@heynixie/connectors/test-utils';
import { readPreviewPage, startTestDevices } from '../test-utils';
import { buildDeviceTools } from './build-device-tools';
import type { DevicePreviewOptions } from './device-tool-options';

type Render = DevicePreviewOptions['draw'];

interface TestFetching {
  readonly allowedHosts: readonly string[];
}

async function setupTest(fetching?: TestFetching) {
  // each test that needs a picture sets the render's outcome itself
  const draw = mock<Render>(() => Promise.resolve({ kind: 'failed' as const, reason: 'not set' }));

  const ctx = await startTestDevices({
    preview: { draw, timeZone: 'UTC' },
    ...(fetching === undefined ? {} : { fetching }),
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

test.each([
  { width: 1872, height: 1404, pixelRatio: 2 },
  { width: 1873, height: 1404, pixelRatio: 2 },
  { width: 1233, height: 1251, pixelRatio: 2.5 },
])('it asks for a render of $width by $height pixels at ratio $pixelRatio', async (row) => {
  const ctx = await setupTest();

  ctx.streams.resize(ctx.device.deviceID, row);

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  const request = ctx.draw.mock.calls[0]?.[0];

  expect({
    width: request?.width,
    height: request?.height,
    pixelRatio: request?.pixelRatio,
  }).toStrictEqual(row);
});

test('it shows a clock in the time zone that the device sent', async () => {
  const ctx = await setupTest();

  ctx.streams.resize(ctx.device.deviceID, {
    width: 1872,
    height: 1404,
    pixelRatio: 2,
    timeZone: 'Australia/Sydney',
  });

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'clock', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'clock',
    content: { kind: 'live', live: 'clock', format: 'HH:mm' },
  });

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  const page = readPreviewPage(ctx.draw.mock.calls[0]?.[0].files ?? []);

  expect(page).toContain('19:00');
});

test('it sends no image that a show covers', async () => {
  const ctx = await setupTest();

  await ctx.seed.image('k3x9m2p7qa');

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' },
  });

  await ctx.call('device.show', {
    device: ctx.device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(ctx.draw.mock.calls[0]?.[0].files.map((file) => file.path)).toStrictEqual(['index.html']);
});

test('it sends the image that a region of the layout shows', async () => {
  const ctx = await setupTest();

  await ctx.seed.image('k3x9m2p7qa');

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' },
  });

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(ctx.draw.mock.calls[0]?.[0].files.map((file) => file.path)).toStrictEqual([
    'index.html',
    'images/0',
  ]);
});

test("it returns the device's size in pixels and the picture as the render drew it", async () => {
  const ctx = await setupTest();
  const encoded = await encodeTestImage({ width: 1872, height: 1404 }, 'png');

  const png = new Uint8Array(encoded);

  ctx.draw.mockResolvedValue({ kind: 'picture', png, refused: [] });

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
    images: [{ mediaType: 'image/png', bytes: png }],
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

  const page = readPreviewPage(ctx.draw.mock.calls[0]?.[0].files ?? []);

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
  const ctx = await setupTest();

  ctx.draw.mockResolvedValue({ kind: 'failed', reason: 'no browser' });

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

test('it returns no error for content that a region shows again after other content', async () => {
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
    atMs: 1,
    message: 'old content failed',
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Calm' },
    minutes: 10,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  ctx.clock.advance(11 * 60_000);

  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toMatchObject({ result: { errors: [] } });
});

test('it returns no error for a region that a new layout cleared', async () => {
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
    atMs: 1,
    message: 'old content failed',
  });

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'lake', column: 1, row: 1 }],
  });

  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toMatchObject({ result: { errors: [] } });
});

test('it draws a page with the files of the approved packages it names, and no others', async () => {
  const ctx = await setupTest({ allowedHosts: [] });

  await ctx.seed.package('chart.js@4.4.6', { 'dist/chart.js': 'var Chart = 1;' });
  await ctx.seed.package('d3@7.9.0', { 'dist/d3.js': 'var d3 = 1;' });

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: {
      kind: 'html',
      html: '<script src="/rpc/device/packages/chart.js@4.4.6/dist/chart.js"></script>',
      packages: ['chart.js@4.4.6'],
    },
  });

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  const paths = ctx.draw.mock.calls[0]?.[0].files.map((file) => file.path) ?? [];
  const page = ctx.draw.mock.calls[0]?.[0].files.find((file) => file.path.startsWith('pages/'));
  const html = Buffer.from(page?.base64 ?? '', 'base64').toString();

  expect(paths).toContain('packages/chart.js@4.4.6/dist/chart.js');
  expect(paths).not.toContain('packages/d3@7.9.0/dist/d3.js');
  expect(html).toContain('src="http://nixie-render.invalid/packages/chart.js@4.4.6/dist/chart.js"');
  expect(html).not.toContain('/rpc/device/packages/');
});

test('it draws a page with what its declared fetches returned, and with their refusals', async () => {
  const ctx = await setupTest({ allowedHosts: [] });

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'note', column: 2, row: 1 },
    ],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'html', html: '<p>x</p>', fetches: [{ url: 'https://tides.example/today' }] },
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'html', html: '<p>x</p>', fetches: [{ url: 'https://weather.example/now' }] },
  });

  const layout = await ctx.readLayout(ctx.device.deviceID);

  const shownOf = (name: string) =>
    layout?.regions.find((candidate) => candidate.name === name)?.shown?.shownID ?? '';

  ctx.streams.fetches.record(
    {
      deviceID: ctx.device.deviceID,
      region: 'pond',
      shown: shownOf('pond'),
      url: 'https://tides.example/today',
    },
    {
      kind: 'body',
      status: 200,
      type: 'application/json',
      body: '{"high":"14:05"}',
      fetchedAtMs: ctx.clock.now(),
    },
  );

  ctx.streams.fetches.record(
    {
      deviceID: ctx.device.deviceID,
      region: 'note',
      shown: shownOf('note'),
      url: 'https://weather.example/now',
    },
    {
      kind: 'refused',
      reason: 'the rules no longer allow it',
    },
  );

  await ctx.call('device.preview', { device: ctx.device.deviceID });

  const files = ctx.draw.mock.calls[0]?.[0].files ?? [];
  const pages = files.map((file) => Buffer.from(file.base64, 'base64').toString('utf8')).join('\n');

  expect(pages).toContain('14:05');
  expect(pages).toContain('REFUSED');
});

test('it marks the picture and the errors as outside content, because a page can show fetched text', async () => {
  const ctx = await setupTest();

  const tool = buildDeviceTools({
    log: ctx.log,
    definitions: ctx.definitions,
    clock: ctx.clock,
    streams: ctx.streams,
  }).find((candidate) => candidate.name === 'device.preview');

  expect([tool?.declaration.results['picture'], tool?.declaration.results['errors']]).toStrictEqual(
    ['untrusted', 'untrusted'],
  );
});

test('it draws a page whose approved package holds a file named after an inherited property', async () => {
  const ctx = await setupTest({ allowedHosts: [] });

  await ctx.seed.package('chart.js@4.4.6', { 'file.constructor': 'x' });

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'html', html: '<p>x</p>', packages: ['chart.js@4.4.6'] },
  });

  const outcome = await ctx.call('device.preview', { device: ctx.device.deviceID });

  expect(outcome).toMatchObject({ result: { errors: [] } });
});
