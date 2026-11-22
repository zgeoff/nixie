import { expect, test } from 'bun:test';
import { parseWindowIDs } from './parse-window-ids';

test('it reads the window IDs of a stacking list in order', () => {
  expect(
    parseWindowIDs('_NET_CLIENT_LIST_STACKING(WINDOW): window id # 0x400003, 0x200004'),
  ).toStrictEqual(['0x400003', '0x200004']);
});

test('it reads no window IDs from an unset property', () => {
  expect(parseWindowIDs('_NET_CLIENT_LIST_STACKING:  no such atom on any window.')).toStrictEqual(
    [],
  );
});
