import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

function setupTest() {
  return startTestDevices();
}

test('it lists an enrolled device with its screen off and nothing it shows', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device({ name: 'desk panel' });
  const listed = await ctx.call('devices.list', {});

  expect(listed).toStrictEqual({
    status: 'ok',
    result: {
      devices: [
        {
          device: device.deviceID,
          name: 'desk panel',
          screen: 'off',
          camera: 'off',
          online: false,
          pixels: null,
          showing: null,
          layout: null,
        },
      ],
    },
  });
});

test('it gives an online device its size and what it shows', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice({ name: 'desk panel' });

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 2 });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
    minutes: 10,
  });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toStrictEqual({
    status: 'ok',
    result: {
      devices: [
        {
          device: device.deviceID,
          name: 'desk panel',
          screen: 'on',
          camera: 'off',
          online: true,
          pixels: { width: 1920, height: 480, pixelRatio: 2 },
          showing: { kind: 'markdown', until: '2026-11-21T08:10:00.000Z' },
          layout: null,
        },
      ],
    },
  });
});

test('it names the image an online device shows', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice({ name: 'desk panel' });

  await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
  });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    result: { devices: [{ showing: { kind: 'image', image: 'k3x9m2p7qa', until: null } }] },
  });
});
