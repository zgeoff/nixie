import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { createDeviceStreams } from './create-device-streams';
import type { DeviceStatusChange } from './create-device-streams';

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });
  const streams = createDeviceStreams({ clock });
  const changes: DeviceStatusChange[] = [];

  streams.subscribeToStatus((change) => {
    changes.push(change);
  });

  return { clock, streams, changes };
}

test('#createDeviceStreams reports a device with no stream as offline with no size', () => {
  const ctx = setupTest();

  expect([ctx.streams.isOnline('dk4m7q2w9x'), ctx.streams.readPixels('dk4m7q2w9x')]).toStrictEqual([
    false,
    null,
  ]);
});

test('#createDeviceStreams reports the size of the newest open stream', () => {
  const ctx = setupTest();

  ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });
  ctx.streams.open('dk4m7q2w9x', { width: 800, height: 600, pixelRatio: 2 });

  expect(ctx.streams.readPixels('dk4m7q2w9x')).toStrictEqual({
    width: 800,
    height: 600,
    pixelRatio: 2,
  });
});

test('#createDeviceStreams keeps a device online while one stream stays open', () => {
  const ctx = setupTest();
  const first = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  ctx.streams.open('dk4m7q2w9x', { width: 800, height: 600, pixelRatio: 1 });
  first.close();
  ctx.clock.advance(120_000);

  expect(ctx.streams.isOnline('dk4m7q2w9x')).toBeTrue();
});

test('#createDeviceStreams keeps a device online for 60 s after its last stream closed', () => {
  const ctx = setupTest();
  const stream = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  stream.close();
  ctx.clock.advance(59_999);

  expect(ctx.streams.isOnline('dk4m7q2w9x')).toBeTrue();
});

test('#createDeviceStreams turns a device offline once it has had no stream for 60 s', async () => {
  const ctx = setupTest();
  const stream = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  stream.close();
  ctx.clock.advance(60_000);

  await waitForCondition(() => !ctx.streams.isOnline('dk4m7q2w9x'));

  expect(ctx.streams.isOnline('dk4m7q2w9x')).toBeFalse();
});

test('#createDeviceStreams keeps a device online when a stream reopens within the grace', () => {
  const ctx = setupTest();
  const first = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  first.close();
  ctx.clock.advance(30_000);
  ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });
  ctx.clock.advance(120_000);

  expect(ctx.streams.isOnline('dk4m7q2w9x')).toBeTrue();
});

test('#createDeviceStreams reports a change to online once, and to offline after the grace', async () => {
  const ctx = setupTest();
  const first = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  first.close();
  ctx.clock.advance(30_000);

  const second = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  second.close();
  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.changes.length === 2);

  expect(ctx.changes).toStrictEqual([
    { deviceID: 'dk4m7q2w9x', status: 'online', atMs: 1_000_000 },
    { deviceID: 'dk4m7q2w9x', status: 'offline', atMs: 1_090_000 },
  ]);
});

test('#createDeviceStreams reports when the last stream closed once the device is offline', async () => {
  const ctx = setupTest();
  const stream = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  ctx.clock.advance(5000);
  stream.close();
  ctx.clock.advance(60_000);

  await waitForCondition(() => !ctx.streams.isOnline('dk4m7q2w9x'));

  expect(ctx.streams.readOfflineSinceMs('dk4m7q2w9x')).toBe(1_005_000);
});

test('#createDeviceStreams reports no offline time while a device is online', () => {
  const ctx = setupTest();
  const stream = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  stream.close();

  expect(ctx.streams.readOfflineSinceMs('dk4m7q2w9x')).toBeNull();
});

test('#createDeviceStreams gives every open stream of a device the new size on a resize', () => {
  const ctx = setupTest();
  const first = ctx.streams.open('dk4m7q2w9x', { width: 1920, height: 480, pixelRatio: 1 });

  ctx.streams.open('dk4m7q2w9x', { width: 800, height: 600, pixelRatio: 1 });
  ctx.streams.resize('dk4m7q2w9x', { width: 1024, height: 768, pixelRatio: 1.5 });
  first.close();

  expect(ctx.streams.readPixels('dk4m7q2w9x')).toStrictEqual({
    width: 1024,
    height: 768,
    pixelRatio: 1.5,
  });
});

test('#createDeviceStreams keeps no size for a resize of a device with no open stream', () => {
  const ctx = setupTest();

  ctx.streams.resize('dk4m7q2w9x', { width: 1024, height: 768, pixelRatio: 1 });

  expect(ctx.streams.readPixels('dk4m7q2w9x')).toBeNull();
});
