import { expect, test } from 'bun:test';
import { isKnownPushService } from './is-known-push-service.ts';

test.each([
  ['https://fcm.googleapis.com/fcm/send/abc', true],
  ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
  ['https://web.push.apple.com/abc', true],
  ['https://db5p.notify.windows.com/w/?token=abc', true],
  ['http://fcm.googleapis.com/fcm/send/abc', false],
  ['https://evilfcm.googleapis.com/fcm/send/abc', false],
  ['https://fcm.googleapis.com.example.net/abc', false],
  ['https://127.0.0.1:8787/api/log', false],
])('it judges %s known: %p', (endpoint, expected) => {
  expect(isKnownPushService(new URL(endpoint))).toBe(expected);
});
