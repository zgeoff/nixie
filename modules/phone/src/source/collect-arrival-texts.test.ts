import { expect, test } from 'bun:test';
import { collectArrivalTexts } from './collect-arrival-texts';

test('#collectArrivalTexts takes the texts received in the last hour', () => {
  const nowMs = 10 * 3_600_000;

  const texts = collectArrivalTexts(
    [
      { messageID: 'a', from: 'X', receivedAt: nowMs - 3_600_000, body: '' },
      { messageID: 'b', from: 'X', receivedAt: nowMs - 3_600_001, body: '' },
    ],
    nowMs,
  );

  expect(texts.map((text) => text.messageID)).toStrictEqual(['a']);
});
