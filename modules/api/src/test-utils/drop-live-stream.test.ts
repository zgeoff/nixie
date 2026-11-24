import { expect, test } from 'bun:test';
import { createDeviceSession } from './create-device-session';
import { dropLiveStream } from './drop-live-stream';
import { startTestAPI } from './start-test-api';

test('it resolves once the server sent the opened event of the stream', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const [settled] = await Promise.allSettled([dropLiveStream(api.url, laptop.token, {})]);

  expect(settled).toStrictEqual({ status: 'fulfilled', value: undefined });
});
