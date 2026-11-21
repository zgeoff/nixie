import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

function setupTest() {
  return startTestDevices();
}

test('it stores a scene for a device', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'markdown', text: '# Saturday\nLow tide 14:05' }],
  });

  expect(outcome).toStrictEqual({ status: 'ok', result: { idle: true } });
});

test('it leaves the screen black for an empty scene', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();
  const outcome = await ctx.call('device.setIdle', { device: device.deviceID, scene: [] });

  expect(outcome).toStrictEqual({ status: 'ok', result: { idle: true } });
});

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('device.setIdle', { device: 'zz9plural1', scene: [] });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a scene with an unknown image', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'image', image: 'k3x9m2p7qa' }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_IMAGE' });
});

test('it fails a scene of more than 8 blocks', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: Array.from({ length: 9 }, () => ({ kind: 'markdown', text: '# Saturday' })),
  });

  expect(outcome.status).toBe('error');
});

test('it fails a scene past 20,000 characters of markdown', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [
      { kind: 'markdown', text: 'a'.repeat(12_000) },
      { kind: 'markdown', text: 'b'.repeat(12_000) },
    ],
  });

  expect(outcome.status).toBe('error');
});
