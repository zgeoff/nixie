import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { pickAnsweredInbox } from './pick-answered-inbox';

test('#pickAnsweredInbox leaves the inbox whole when no reply was kept', () => {
  const inbox = [buildMockLogRecord({ sequence: 3 }), buildMockLogRecord({ sequence: 8 })];

  expect(pickAnsweredInbox(inbox, new Set())).toStrictEqual({ remaining: inbox, answered: [] });
});

test('#pickAnsweredInbox skips only the records that a kept reply answers', () => {
  const inbox = [
    buildMockLogRecord({ sequence: 3 }),
    buildMockLogRecord({ sequence: 5 }),
    buildMockLogRecord({ sequence: 8 }),
  ];

  expect(pickAnsweredInbox(inbox, new Set([3, 5]))).toStrictEqual({
    remaining: inbox.slice(2),
    answered: [3, 5],
  });
});

test('#pickAnsweredInbox keeps a record that landed before the reply but was not read', () => {
  const inbox = [buildMockLogRecord({ sequence: 2 }), buildMockLogRecord({ sequence: 3 })];

  expect(pickAnsweredInbox(inbox, new Set([2]))).toStrictEqual({
    remaining: inbox.slice(1),
    answered: [2],
  });
});
