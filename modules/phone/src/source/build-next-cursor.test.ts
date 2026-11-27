import { expect, test } from 'bun:test';
import { buildNextCursor } from './build-next-cursor';

test('#buildNextCursor moves to the newest time of the new texts and skips each text at it', () => {
  const cursor = buildNextCursor({ since: 1000, skip: ['a'] }, [
    { messageID: 'b', from: 'X', receivedAt: 3000, body: '' },
    { messageID: 'c', from: 'X', receivedAt: 2000, body: '' },
  ]);

  expect(cursor).toStrictEqual({ since: 3000, skip: ['b'] });
});

test('#buildNextCursor keeps the skipped texts when a new text arrives at the cursor time', () => {
  const cursor = buildNextCursor({ since: 1000, skip: ['a'] }, [
    { messageID: 'b', from: 'X', receivedAt: 1000, body: '' },
  ]);

  expect(cursor).toStrictEqual({ since: 1000, skip: ['a', 'b'] });
});
