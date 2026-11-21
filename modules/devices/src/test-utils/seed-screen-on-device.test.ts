import { expect, test } from 'bun:test';
import { startTestDevices } from './start-test-devices';

test('#seedScreenOnDevice enrols a device that switched its screen on', async () => {
  const ctx = await startTestDevices();
  const seeded = await ctx.seed.screenOnDevice();
  const device = await ctx.readDevice(seeded.identityID);

  expect(device?.capabilities).toStrictEqual({
    screen: true,
    camera: false,
    speaker: false,
    microphone: false,
  });
});

test('#seedScreenOnDevice names the device from its input', async () => {
  const ctx = await startTestDevices();
  const seeded = await ctx.seed.screenOnDevice({ name: 'hall tablet' });
  const device = await ctx.readDevice(seeded.identityID);

  expect(device?.name).toBe('hall tablet');
});
