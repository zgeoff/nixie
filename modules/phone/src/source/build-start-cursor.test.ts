import { expect, test } from 'bun:test';
import { buildStartCursor } from './build-start-cursor';

test('#buildStartCursor stands at the newest text and skips each text at that time', () => {
  const cursor = buildStartCursor([
    { messageID: 'a', from: 'X', receivedAt: 2000, body: '' },
    { messageID: 'b', from: 'X', receivedAt: 2000, body: '' },
    { messageID: 'c', from: 'X', receivedAt: 1000, body: '' },
  ]);

  expect(cursor).toStrictEqual({ since: 2000, skip: ['a', 'b'] });
});

test('#buildStartCursor takes every later text as new when the provider holds none', () => {
  expect(buildStartCursor([])).toStrictEqual({ since: 0, skip: [] });
});
