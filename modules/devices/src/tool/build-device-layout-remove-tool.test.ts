import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

async function setupTest() {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  return { ...ctx, device };
}

test('it refuses a device that does not exist', async () => {
  const ctx = await startTestDevices();
  const outcome = await ctx.call('device.layout_remove', { device: 'zz9plural1', name: 'evening' });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it deletes a saved layout and keeps the others', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });
  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'morning' });

  const removed = await ctx.call('device.layout_remove', {
    device: ctx.device.deviceID,
    name: 'evening',
  });

  const listed = await ctx.call('device.layouts', { device: ctx.device.deviceID });

  expect([removed, listed]).toStrictEqual([
    { status: 'ok', result: { device: ctx.device.deviceID, name: 'evening' } },
    {
      status: 'ok',
      result: {
        device: ctx.device.deviceID,
        layouts: [{ name: 'morning', savedAt: '2026-11-21T08:00:00.000Z' }],
      },
    },
  ]);
});

test('it refuses an unknown name and lists the saved names', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'morning' });

  const outcome = await ctx.call('device.layout_remove', {
    device: ctx.device.deviceID,
    name: 'noon',
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    refusalCode: 'UNKNOWN_LAYOUT',
    result: {
      refused: 'UNKNOWN_LAYOUT',
      message: 'This device has no saved layout named noon. The saved layouts are morning.',
    },
  });
});

test('it leaves the layout the device holds when a saved layout goes', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });
  await ctx.call('device.layout_remove', { device: ctx.device.deviceID, name: 'evening' });

  const layout = await ctx.readLayout(ctx.device.deviceID);

  expect(layout?.regions.map((region) => region.name)).toStrictEqual(['pond', 'note', 'clock']);
});
