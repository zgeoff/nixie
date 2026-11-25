import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

function setupTest() {
  return startTestDevices();
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('device.layout_save', { device: 'zz9plural1', name: 'evening' });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses to save a device that holds no layout', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.layout_save', {
    device: device.deviceID,
    name: 'evening',
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'NO_LAYOUT' });
});

test('it saves the layout under a name and lists the name', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const saved = await ctx.call('device.layout_save', { device: device.deviceID, name: 'evening' });
  const listed = await ctx.call('device.layouts', { device: device.deviceID });

  expect([saved, listed]).toStrictEqual([
    { status: 'ok', result: { device: device.deviceID, name: 'evening', replaced: false } },
    {
      status: 'ok',
      result: {
        device: device.deviceID,
        layouts: [{ name: 'evening', savedAt: '2026-11-21T08:00:00.000Z' }],
      },
    },
  ]);
});

test('it replaces a saved layout when a save reuses its name', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);
  await ctx.call('device.layout_save', { device: device.deviceID, name: 'evening' });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'garden', column: 1, row: 1 }],
  });

  ctx.clock.advance(60_000);

  const replaced = await ctx.call('device.layout_save', {
    device: device.deviceID,
    name: 'evening',
  });

  const listed = await ctx.call('device.layouts', { device: device.deviceID });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'orchard', column: 1, row: 1 }],
  });

  await ctx.call('device.layout_restore', { device: device.deviceID, name: 'evening' });

  const restored = await ctx.readLayout(device.deviceID);

  expect(restored?.regions.map((region) => region.name)).toStrictEqual(['garden']);

  expect([replaced, listed]).toStrictEqual([
    { status: 'ok', result: { device: device.deviceID, name: 'evening', replaced: true } },
    {
      status: 'ok',
      result: {
        device: device.deviceID,
        layouts: [{ name: 'evening', savedAt: '2026-11-21T08:01:00.000Z' }],
      },
    },
  ]);
});

test('it keeps the saved layouts of two devices apart', async () => {
  const ctx = await setupTest();
  const first = await ctx.seed.screenOnDevice();
  const second = await ctx.seed.screenOnDevice();

  ctx.streams.open(first.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(first.deviceID);
  await ctx.call('device.layout_save', { device: first.deviceID, name: 'evening' });

  const listed = await ctx.call('device.layouts', { device: second.deviceID });

  expect(listed).toStrictEqual({
    status: 'ok',
    result: { device: second.deviceID, layouts: [] },
  });
});
