import { expect, test } from 'bun:test';
import { parseNoticeKey } from './parse-notice-key';

test.each([
  ['turn/conversation/42', { kind: 'turn', messageSequence: 42 }],
  ['run/run-7', { kind: 'run', messageSequence: null }],
] as const)('it parses %s', (noticeKey, expected) => {
  expect(parseNoticeKey(noticeKey)).toStrictEqual(expected);
});
