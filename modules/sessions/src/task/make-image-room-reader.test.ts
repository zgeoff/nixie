import { expect, test } from 'bun:test';
import { makeImageReserver } from './make-image-reserver';
import { makeImageRoomReader } from './make-image-room-reader';

test('it reads what the budget has left after an image is reserved', () => {
  const live = {
    spent: { bytes: 400, count: 3 },
    budget: { bytes: 10_000, count: 100 },
    isCapped: false,
  };

  makeImageReserver(live)([{ mediaType: 'image/png', bytes: new Uint8Array(30) }]);

  expect(makeImageRoomReader(live)()).toStrictEqual({ bytes: 9560, count: 96 });
});

test('it reads no room, never a negative one, for a budget that is spent', () => {
  const live = {
    spent: { bytes: 12_000, count: 100 },
    budget: { bytes: 10_000, count: 100 },
    isCapped: false,
  };

  expect(makeImageRoomReader(live)()).toStrictEqual({ bytes: 0, count: 0 });
});
