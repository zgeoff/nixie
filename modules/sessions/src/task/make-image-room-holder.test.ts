import { expect, test } from 'bun:test';
import { largestImageBytes } from '@heynixie/connectors';
import { makeImageReserver } from './make-image-reserver';
import { makeImageRoomHolder } from './make-image-room-holder';
import { makeImageRoomReader } from './make-image-room-reader';

function setupTest() {
  const live = {
    spent: { bytes: 0, count: 0 },
    budget: { bytes: largestImageBytes * 10, count: 1 },
    isCapped: false,
  };

  return { live, holder: makeImageRoomHolder(live), readRoom: makeImageRoomReader(live) };
}

test('it holds the last room for one key and refuses a second key', () => {
  const ctx = setupTest();
  const first = ctx.holder.holdImageRoom('call-a');
  const second = ctx.holder.holdImageRoom('call-b');

  expect([first, second]).toStrictEqual([true, false]);
  expect(ctx.readRoom().count).toBe(0);
});

test('it counts a key that holds twice once', () => {
  const ctx = setupTest();

  ctx.live.budget = { bytes: largestImageBytes * 10, count: 3 };

  ctx.holder.holdImageRoom('call-a');
  ctx.holder.holdImageRoom('call-a');

  expect(ctx.readRoom().count).toBe(2);
});

test('it frees the room once, so a second release of the key frees nothing', () => {
  const ctx = setupTest();

  ctx.live.budget = { bytes: largestImageBytes * 10, count: 3 };

  ctx.holder.holdImageRoom('call-a');
  ctx.holder.holdImageRoom('call-b');
  ctx.holder.releaseImageRoom('call-a');
  ctx.holder.releaseImageRoom('call-a');

  expect(ctx.readRoom().count).toBe(2);
});

test('it lets the freed room take the picture the call got', () => {
  const ctx = setupTest();

  ctx.holder.holdImageRoom('call-a');
  ctx.holder.releaseImageRoom('call-a');

  const isReserved = makeImageReserver(ctx.live)([
    { mediaType: 'image/png', bytes: new Uint8Array(30) },
  ]);

  expect(isReserved).toBe(true);
});
