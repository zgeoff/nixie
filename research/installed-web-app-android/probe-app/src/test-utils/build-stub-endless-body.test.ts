import { expect, test } from 'bun:test';
import { buildStubEndlessBody } from './build-stub-endless-body.ts';

test('it gives the chunk on each read and counts the pulls', async () => {
  const body = buildStubEndlessBody(new Uint8Array([7, 8]));
  const reader = body.stream.getReader();

  const first = await reader.read();
  const second = await reader.read();

  expect(first).toStrictEqual({ done: false, value: new Uint8Array([7, 8]) });
  expect(second).toStrictEqual({ done: false, value: new Uint8Array([7, 8]) });
  // each read takes a pulled chunk, and the stream may already have pulled 1 more to refill its
  // queue of 1 chunk, depending on when the runtime schedules that pull
  expect(body.countPulls()).toBeGreaterThanOrEqual(2);
  expect(body.countPulls()).toBeLessThanOrEqual(3);
});

test('it records the reason of a cancel', async () => {
  const body = buildStubEndlessBody(new Uint8Array([7, 8]));

  await body.stream.cancel('enough');

  expect(body.cancels).toStrictEqual(['enough']);
});
