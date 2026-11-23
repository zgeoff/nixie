import { expect, test } from 'bun:test';
import { startTestDevices } from './start-test-devices';

test('#makeDeviceToolPreparer answers the refusal of a call to a device that does not exist', async () => {
  const ctx = await startTestDevices();

  const prepared = await ctx.prepare('device.region', {
    device: 'zz9plural1',
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  expect(prepared).toMatchObject({ refusalCode: 'UNKNOWN_DEVICE' });
});

test('#makeDeviceToolPreparer fails for a tool that reads nothing before its call', async () => {
  const ctx = await startTestDevices();
  const outcome = await Promise.allSettled([ctx.prepare('devices.list', {})]);

  expect(outcome).toStrictEqual([
    { status: 'rejected', reason: new Error('devices.list reads nothing before its call') },
  ]);
});
