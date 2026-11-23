import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

function setupTest() {
  return startTestDevices();
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call('device.layout', {
    device: 'zz9plural1',
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a screen that is off', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'SCREEN_OFF' });
});

test('it refuses a layout with overlapping regions and says which', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'note', column: 1, row: 1 },
    ],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    refusalCode: 'BAD_LAYOUT',
    result: { refused: 'BAD_LAYOUT', message: 'the regions pond and note overlap' },
  });
});

test('it refuses a clear that also sets a grid', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    clear: true,
    columns: ['1fr'],
  });

  expect(outcome).toMatchObject({ refusalCode: 'BAD_LAYOUT' });
});

test('it refuses an offline device with its screen on', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'OFFLINE' });
});

test('it names the regions of the layout it set', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr', '2fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'bin-day', column: 2, row: 1 },
    ],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { device: device.deviceID, regions: ['pond', 'bin-day'] },
  });
});

test('it keeps the layout of a device that went offline, and lists it', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const stream = ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  stream.close();

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    result: {
      devices: [
        {
          online: false,
          showing: null,
          layout: {
            layout: expect.toBeString(),
            columns: ['1fr', '2fr', '1fr'],
            rows: ['1fr'],
            regions: [
              { name: 'pond', kind: null, until: null, shown: null },
              { name: 'note', kind: null, until: null, shown: null },
              { name: 'clock', kind: null, until: null, shown: null },
            ],
          },
        },
      ],
    },
  });
});

test('it clears every region when a new layout replaces the layout', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out **tonight**' },
  });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr', '2fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'note', column: 2, row: 1 },
      { name: 'clock', column: 3, row: 1 },
    ],
  });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    result: {
      devices: [
        {
          layout: {
            regions: [
              { name: 'pond', kind: null },
              { name: 'note', kind: null },
              { name: 'clock', kind: null },
            ],
          },
        },
      ],
    },
  });
});

test('it removes the layout when it clears one', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.layout', { device: device.deviceID, clear: true });
  const listed = await ctx.call('devices.list', {});

  expect([outcome, listed]).toMatchObject([
    { status: 'ok', result: { device: device.deviceID, regions: [] } },
    { result: { devices: [{ layout: null }] } },
  ]);
});
