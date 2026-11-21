import { expect, test } from 'bun:test';
import { pickRoomLeft } from './pick-room-left';

test.each([
  { room: { bytes: 24 * 1024 * 1024, count: 100 }, left: 3 },
  { room: { bytes: 24 * 1024 * 1024, count: 2 }, left: 2 },
  { room: { bytes: 1000, count: 100 }, left: 0 },
  { room: { bytes: 0, count: 0 }, left: 0 },
  { room: undefined, left: 0 },
])('#pickRoomLeft leaves $left for $room', (row) => {
  expect(pickRoomLeft(row.room)).toBe(row.left);
});
