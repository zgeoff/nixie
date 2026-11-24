import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

function setupTest() {
  return startTestDevices();
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('devices.watch', { device: 'zz9plural1', wake: ['online'] });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it sets the changes that wake the model, and answers them', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  const outcome = await ctx.call('devices.watch', {
    device: device.deviceID,
    wake: ['online', 'offline'],
  });

  expect(outcome).toStrictEqual({ status: 'ok', result: { wake: ['online', 'offline'] } });
});

test('it answers each change once when a call names it twice', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  const outcome = await ctx.call('devices.watch', {
    device: device.deviceID,
    wake: ['online', 'online'],
  });

  expect(outcome).toStrictEqual({ status: 'ok', result: { wake: ['online'] } });
});

test('it fails a change that is neither online nor offline', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();
  const outcome = await ctx.call('devices.watch', { device: device.deviceID, wake: ['asleep'] });

  expect(outcome.status).toBe('error');
});

test('it lets devices.list show the list that the newest call set', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device({ name: 'desk panel' });

  await ctx.call('devices.watch', { device: device.deviceID, wake: ['online'] });
  await ctx.call('devices.watch', { device: device.deviceID, wake: ['offline'] });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    status: 'ok',
    result: { devices: [{ shortID: device.deviceID, wake: ['offline'] }] },
  });
});

test('it leaves an empty list to a device that no call named', async () => {
  const ctx = await setupTest();
  const watched = await ctx.seed.device({ name: 'desk panel' });
  const other = await ctx.seed.device({ name: 'bedroom speaker' });

  await ctx.call('devices.watch', { device: watched.deviceID, wake: ['online'] });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    result: {
      devices: [
        { shortID: other.deviceID, wake: [] },
        { shortID: watched.deviceID, wake: ['online'] },
      ],
    },
  });
});

test('it empties the list with an empty call', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  await ctx.call('devices.watch', { device: device.deviceID, wake: ['online'] });
  await ctx.call('devices.watch', { device: device.deviceID, wake: [] });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({ result: { devices: [{ wake: [] }] } });
});
