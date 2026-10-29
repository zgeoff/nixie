import { expect, test } from 'bun:test';
import { makeImageReserver } from './make-image-reserver';

test('it reserves an image that fills the last place in the budget, counted by its base64 length', () => {
  const live = {
    spent: { bytes: 400, count: 99 },
    budget: { bytes: 10_000, count: 100 },
    isCapped: false,
  };

  const isReserved = makeImageReserver(live)([
    { mediaType: 'image/png', bytes: new Uint8Array(10) },
  ]);

  expect(isReserved).toBe(true);
  expect(live.spent).toStrictEqual({ bytes: 416, count: 100 });
});

test('it refuses an image past the count of a budget it fills, and spends nothing', () => {
  const live = {
    spent: { bytes: 400, count: 100 },
    budget: { bytes: 10_000, count: 100 },
    isCapped: false,
  };

  const isReserved = makeImageReserver(live)([
    { mediaType: 'image/png', bytes: new Uint8Array(10) },
  ]);

  expect(isReserved).toBe(false);
  expect(live.spent).toStrictEqual({ bytes: 400, count: 100 });
});

test('it refuses an image past the bytes of the budget, and spends nothing', () => {
  const live = {
    spent: { bytes: 9990, count: 3 },
    budget: { bytes: 10_000, count: 100 },
    isCapped: false,
  };

  const isReserved = makeImageReserver(live)([
    { mediaType: 'image/png', bytes: new Uint8Array(10) },
  ]);

  expect(isReserved).toBe(false);
  expect(live.spent).toStrictEqual({ bytes: 9990, count: 3 });
});
