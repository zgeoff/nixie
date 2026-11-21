import { expect, test } from 'bun:test';
import { startTestDevices } from './start-test-devices';

test('#seedDevice enrols a device with its screen off and nothing shown', async () => {
  const ctx = await startTestDevices();
  const seeded = await ctx.seed.device();
  const device = await ctx.readDevice(seeded.identityID);

  expect(device).toStrictEqual({
    deviceID: seeded.deviceID,
    identityID: seeded.identityID,
    name: 'desk panel',
    capabilities: { screen: false, camera: false, speaker: false, microphone: false },
    shownSequence: null,
    idleSequence: null,
  });
});

test('#seedDevice names the device from its input', async () => {
  const ctx = await startTestDevices();
  const seeded = await ctx.seed.device({ name: 'hall tablet' });
  const device = await ctx.readDevice(seeded.identityID);

  expect(device?.name).toBe('hall tablet');
});
