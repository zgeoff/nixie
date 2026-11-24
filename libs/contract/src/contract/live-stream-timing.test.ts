import { expect, test } from 'bun:test';
import { liveStreamTiming } from './live-stream-timing';

test('it fits 3 keepalive intervals in the idle limit of the client', () => {
  expect(3 * liveStreamTiming.keepAliveMs).toBeLessThanOrEqual(liveStreamTiming.idleLimitMs);
});
