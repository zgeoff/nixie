import { expect, test } from 'bun:test';
import { updateDiscardedOutboxIDs } from './update-discarded-outbox-ids';

const now = Date.parse('2026-10-17T12:00:00.000Z');

test('it adds a discarded message to the list every tab reads', () => {
  updateDiscardedOutboxIDs(now, '8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70');

  expect(updateDiscardedOutboxIDs(now + 1000)).toStrictEqual([
    '8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70',
  ]);
});

test('it lists a message once when two tabs discard it', () => {
  updateDiscardedOutboxIDs(now, '8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70');

  expect(updateDiscardedOutboxIDs(now, '8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70')).toStrictEqual([
    '8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70',
  ]);
});

test('it drops a discard older than a day, and the storage key with it', () => {
  updateDiscardedOutboxIDs(now, '8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70');

  expect(updateDiscardedOutboxIDs(now + 24 * 60 * 60 * 1000 + 1)).toStrictEqual([]);
  expect(globalThis.localStorage.getItem('nixie.outbox.discarded')).toBeNull();
});

test('it reads a list that does not parse as empty', () => {
  globalThis.localStorage.setItem('nixie.outbox.discarded', '{not json');

  expect(updateDiscardedOutboxIDs(now)).toStrictEqual([]);
});
