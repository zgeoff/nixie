import { expect, test } from 'bun:test';
import { startTestDevices } from './start-test-devices';

test('#seedLayout gives an online device a layout of 3 blank regions', async () => {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const layout = await ctx.readLayout(device.deviceID);

  expect(layout?.regions.map((region) => [region.name, region.shown])).toStrictEqual([
    ['pond', null],
    ['note', null],
    ['clock', null],
  ]);
});

test('#seedLayout fails for a device that is offline', async () => {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();
  const outcome = await Promise.allSettled([ctx.seed.layout(device.deviceID)]);

  expect(outcome).toStrictEqual([
    { status: 'rejected', reason: new Error('the seeded layout was refused') },
  ]);
});
