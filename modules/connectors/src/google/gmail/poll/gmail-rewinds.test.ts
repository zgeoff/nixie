import { expect, test } from 'bun:test';
import { createGmailRewinds } from './gmail-rewinds';

test('#createGmailRewinds keeps the earliest time that a connection was asked for', () => {
  const rewinds = createGmailRewinds();

  rewinds.request('conn-1', 5000);
  rewinds.request('conn-1', 3000);
  rewinds.request('conn-1', 4000);

  expect([rewinds.read('conn-1'), rewinds.read('conn-2')]).toStrictEqual([3000, null]);
});

test('#createGmailRewinds drops the time that a poll read', () => {
  const rewinds = createGmailRewinds();

  rewinds.request('conn-1', 3000);
  rewinds.clear('conn-1', 3000);

  expect(rewinds.read('conn-1')).toBeNull();
});

test('#createGmailRewinds keeps an earlier time that came in after the poll read', () => {
  const rewinds = createGmailRewinds();

  rewinds.request('conn-1', 3000);
  rewinds.request('conn-1', 1000);
  rewinds.clear('conn-1', 3000);

  expect(rewinds.read('conn-1')).toBe(1000);
});
