import { expect, onTestFinished, test } from 'bun:test';
import { startStubPushService } from './start-stub-push-service.ts';

test('it answers each push with the given status and records its body and headers', async () => {
  const pushService = startStubPushService(410);

  const response = await fetch(pushService.endpoint, {
    method: 'POST',
    headers: { urgency: 'high' },
    body: new Uint8Array([1, 2, 3]),
  });

  expect(response.status).toBe(410);
  expect(pushService.received.mock.calls).toStrictEqual([
    [new Uint8Array([1, 2, 3]), expect.any(Headers)],
  ]);
  expect(pushService.received.mock.calls[0]?.[1].get('urgency')).toBe('high');
});

test('it refuses connections once stopped', async () => {
  const pushService = startStubPushService(201);

  pushService.stop();

  expect(fetch(pushService.endpoint, { method: 'POST' })).rejects.toThrow();
});

test('it stops when the test ends', () => {
  const pushService = startStubPushService(201);

  onTestFinished(async () => {
    expect(fetch(pushService.endpoint, { method: 'POST' })).rejects.toThrow();
  });
});
