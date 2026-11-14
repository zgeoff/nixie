import { expect, test } from 'bun:test';
import { makeMessageCursor } from './make-message-cursor';

test('it starts at the start of the log with no message removed', () => {
  const cursor = makeMessageCursor();

  expect(cursor.readThrough()).toBe(0);
  expect(cursor.isRemoved(7)).toBeFalse();
});

test('it reads back the last sequence it was moved to', () => {
  const cursor = makeMessageCursor();

  cursor.updateThrough(12);
  cursor.updateThrough(40);

  expect(cursor.readThrough()).toBe(40);
});

test('it reports a removed message as removed and leaves the others', () => {
  const cursor = makeMessageCursor();

  cursor.addRemoved(7);

  expect(cursor.isRemoved(7)).toBeTrue();
  expect(cursor.isRemoved(8)).toBeFalse();
});
