import { expect, test } from 'bun:test';
import { buildNextCursor } from './build-next-cursor';

test('#buildNextCursor moves to the newest time of the new texts and skips each text at it', () => {
  const cursor = buildNextCursor({ since: 1000, skip: ['a'], floor: 500 }, [
    { messageID: 'b', from: 'X', receivedAt: 3000, precisionMs: 1, body: '' },
    { messageID: 'c', from: 'X', receivedAt: 2000, precisionMs: 1, body: '' },
  ]);

  expect(cursor).toStrictEqual({ since: 3000, skip: ['b'], floor: 500 });
});

test('#buildNextCursor keeps the skipped texts when a new text arrives at the cursor time', () => {
  const cursor = buildNextCursor({ since: 1000, skip: ['a'], floor: 500 }, [
    { messageID: 'b', from: 'X', receivedAt: 1000, precisionMs: 1, body: '' },
  ]);

  expect(cursor).toStrictEqual({ since: 1000, skip: ['a', 'b'], floor: 500 });
});

test('#buildNextCursor stays where it is for a late text behind the cursor', () => {
  const cursor = buildNextCursor({ since: 1000, skip: ['a'], floor: 500 }, [
    { messageID: 'b', from: 'X', receivedAt: 800, precisionMs: 1, body: '' },
  ]);

  expect(cursor).toStrictEqual({ since: 1000, skip: ['a'], floor: 500 });
});
