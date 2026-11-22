import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';
import { readDeviceImage } from './read-device-image';

async function setupTest() {
  const ctx = await startTestDevices();

  return {
    ...ctx,
    readImage: async (identityID: string, image: string) => {
      const device = await ctx.readDevice(identityID);

      return device === null
        ? null
        : readDeviceImage(ctx.log, device, { image, nowMs: ctx.clock.now() });
    },
  };
}

test('#readDeviceImage reads an image that the device shows', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 1920, height: 480 });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa' },
  });

  const image = await ctx.readImage(device.identityID, 'k3x9m2p7qa');

  expect(image).toStrictEqual({ mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
});

test('#readDeviceImage reads an image of the idle scene', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  await ctx.seed.image('k3x9m2p7qa');

  await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [
      { kind: 'markdown', text: '# Saturday' },
      { kind: 'image', image: 'k3x9m2p7qa' },
    ],
  });

  const image = await ctx.readImage(device.identityID, 'k3x9m2p7qa');

  expect(image).toStrictEqual({ mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
});

test('#readDeviceImage refuses a stored image that the device does not show', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  await ctx.seed.image('k3x9m2p7qa');
  await ctx.seed.image('p8w2n5c1rt');

  await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'image', image: 'k3x9m2p7qa' }],
  });

  const image = await ctx.readImage(device.identityID, 'p8w2n5c1rt');

  expect(image).toBeNull();
});

test('#readDeviceImage refuses an image that a later show replaced', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 1920, height: 480 });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa' },
  });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  const image = await ctx.readImage(device.identityID, 'k3x9m2p7qa');

  expect(image).toBeNull();
});
