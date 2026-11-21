import { expect, test } from 'bun:test';
import { createDeviceStreams } from './create-device-streams';

test('#createDeviceStreams reports a device with no stream as offline with no size', () => {
  const streams = createDeviceStreams();

  expect([streams.isOnline('dk4m7q2w9x'), streams.readPixels('dk4m7q2w9x')]).toStrictEqual([
    false,
    null,
  ]);
});

test('#createDeviceStreams reports the size of the newest open stream', () => {
  const streams = createDeviceStreams();

  streams.open('dk4m7q2w9x', { width: 1920, height: 480 });
  streams.open('dk4m7q2w9x', { width: 800, height: 600 });

  expect(streams.readPixels('dk4m7q2w9x')).toStrictEqual({ width: 800, height: 600 });
});

test('#createDeviceStreams keeps a device online until its last stream closes', () => {
  const streams = createDeviceStreams();
  const first = streams.open('dk4m7q2w9x', { width: 1920, height: 480 });
  const second = streams.open('dk4m7q2w9x', { width: 800, height: 600 });

  first.close();

  const afterFirst = streams.isOnline('dk4m7q2w9x');

  second.close();

  expect([afterFirst, streams.isOnline('dk4m7q2w9x')]).toStrictEqual([true, false]);
});
