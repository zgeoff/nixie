import { expect, test } from 'bun:test';
import { readOpenErasures } from '@heynixie/log';
import { startTestDevices } from './start-test-devices';

test('#forgetTestRecord blanks the region that shows the record and leaves no erasure open', async () => {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  const shown = await ctx.readLayout(device.deviceID);

  await ctx.forget(shown?.regions[1]?.shown?.sequence ?? 0);

  const after = await ctx.readLayout(device.deviceID);
  const open = await readOpenErasures(ctx.log);

  expect([after?.regions[1]?.shown, open]).toStrictEqual([null, []]);
});
