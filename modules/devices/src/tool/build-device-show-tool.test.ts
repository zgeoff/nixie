import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

function setupTest() {
  return startTestDevices();
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call('device.show', {
    device: 'zz9plural1',
    content: { kind: 'markdown', text: '# Saturday' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a screen that is off', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    refusalCode: 'SCREEN_OFF',
    result: { refused: 'SCREEN_OFF' },
  });
});

test('it refuses an offline device with its screen on', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'OFFLINE' });
});

test('it refuses an image that is not in the store', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_IMAGE' });
});

test('it refuses an image that a forget made unreadable', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();
  const image = await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.removeKey(image.sequence);

  const outcome = await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'IMAGE_FORGOTTEN' });
});

test.each(['whole', 'fill'])('it shows an image with the fit %s', async (fit) => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa', fit },
  });

  expect(outcome).toStrictEqual({ status: 'ok', result: { shown: true, until: null } });
});

test('it answers the time a show ends when it lasts minutes', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
    minutes: 10,
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { shown: true, until: '2026-11-21T08:10:00.000Z' },
  });
});

test('it fails markdown with no text', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown' },
  });

  expect(outcome.status).toBe('error');
});
