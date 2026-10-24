import { expect, test } from 'bun:test';
import { replyRecord } from '../reply-record.ts';
import { buildMockReplyRecord } from './build-mock-reply-record.ts';

test('it builds a record that the reply record schema accepts', () => {
  const record = buildMockReplyRecord();

  expect(replyRecord.parse(record)).toStrictEqual(record);
});

test('it applies the overrides over the defaults', () => {
  expect(buildMockReplyRecord({ candidate: 'sonnet-opener', gaps: 2 })).toMatchObject({
    candidate: 'sonnet-opener',
    gaps: 2,
    line: 0,
  });
});
