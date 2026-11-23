import { expect, test } from 'bun:test';
import { readDevices } from '../device/read-devices';
import { startTestDevices } from './start-test-devices';

test('#restartTestLog gives a new writer that holds what the old one wrote', async () => {
  const ctx = await startTestDevices();
  const device = await ctx.seed.device({ name: 'desk panel' });
  const restarted = await ctx.restart();
  const devices = await readDevices(restarted.log.writer.db);

  expect(restarted.log.writer).not.toBe(ctx.log.writer);
  expect(devices.map((held) => held.deviceID)).toStrictEqual([device.deviceID]);
});
