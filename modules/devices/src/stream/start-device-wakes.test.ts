import { expect, test } from 'bun:test';
import { readRecords, writeRecordsInTransaction } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
import { startTestDevices } from '../test-utils';
import { startDeviceWakes } from './start-device-wakes';

async function setupTest() {
  const devices = await startTestDevices();

  const failures: unknown[] = [];

  startDeviceWakes({
    log: devices.log,
    definitions: devices.definitions,
    streams: devices.streams,
    thread: 'conversation',
    writeWake: async (tx, input) => {
      await writeRecordsInTransaction(tx, devices.log, [input]);
    },
    onFailure: (error) => {
      failures.push(error);
    },
  });

  return {
    ...devices,
    failures,
    readWakes: async () => {
      const read = await readRecords(devices.log, {
        afterSequence: 0,
        kinds: ['device.status_changed'],
      });

      return read.map((entry) => ({
        thread: entry.record.thread,
        payload: entry.record.payload,
      }));
    },

    // a device whose own change shows that every change before it has been handled
    settle: async () => {
      const sentinel = await devices.seed.device({ name: 'sentinel' });

      await devices.call('devices.watch', { device: sentinel.deviceID, wake: ['online'] });

      devices.streams.open(sentinel.deviceID, { width: 800, height: 600, pixelRatio: 1 });

      await waitForCondition(async () => {
        const read = await readRecords(devices.log, {
          afterSequence: 0,
          kinds: ['device.status_changed'],
        });

        return read.some((entry) => entry.record.payload['device'] === sentinel.deviceID);
      });
    },
    readWakeCount: async () => {
      const read = await readRecords(devices.log, {
        afterSequence: 0,
        kinds: ['device.status_changed'],
      });

      return read.length;
    },
  };
}

test('it writes a record on the conversation when a device with a list naming online comes online', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device({ name: 'desk panel' });

  await ctx.call('devices.watch', { device: device.deviceID, wake: ['online'] });

  ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  await waitForCondition(async () => (await ctx.readWakeCount()) === 1);

  const wakes = await ctx.readWakes();

  expect(wakes).toStrictEqual([
    {
      thread: 'conversation',
      payload: {
        device: device.deviceID,
        name: 'desk panel',
        status: 'online',
        at: ctx.clock.now(),
      },
    },
  ]);
});

test('it writes a record when a device with a list naming offline goes offline', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device({ name: 'desk panel' });

  await ctx.call('devices.watch', { device: device.deviceID, wake: ['offline'] });

  const stream = ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  stream.close();
  ctx.clock.advance(60_000);

  await waitForCondition(async () => (await ctx.readWakeCount()) === 1);

  const wakes = await ctx.readWakes();

  expect(wakes).toMatchObject([{ payload: { status: 'offline' } }]);
});

test('it writes nothing for a device that no call named, only for the one that did', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  const stream = ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  stream.close();
  ctx.clock.advance(60_000);

  await ctx.settle();

  const count = await ctx.readWakeCount();

  expect(count).toBe(1);
});

test('it writes nothing for a change that the list leaves out, only for the sentinel', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  await ctx.call('devices.watch', { device: device.deviceID, wake: ['offline'] });

  ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  await ctx.settle();

  const count = await ctx.readWakeCount();

  expect(count).toBe(1);
});

test('it writes nothing for a device that reconnects within the grace, only for the sentinel', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  await ctx.call('devices.watch', { device: device.deviceID, wake: ['offline'] });

  const first = ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  first.close();
  ctx.clock.advance(30_000);
  ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });
  ctx.clock.advance(120_000);

  await ctx.settle();

  const count = await ctx.readWakeCount();

  expect(count).toBe(1);
});
