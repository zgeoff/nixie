import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { pickAnsweredInbox } from './pick-answered-inbox';

test('#pickAnsweredInbox leaves the inbox whole when no reply was kept', () => {
  const inbox = [buildMockLogRecord({ sequence: 3 }), buildMockLogRecord({ sequence: 8 })];

  expect(pickAnsweredInbox(inbox, null)).toStrictEqual({ remaining: inbox, answered: [] });
});

test('#pickAnsweredInbox skips the records before the kept reply', () => {
  const inbox = [
    buildMockLogRecord({ sequence: 3 }),
    buildMockLogRecord({ sequence: 5 }),
    buildMockLogRecord({ sequence: 8 }),
  ];

  expect(pickAnsweredInbox(inbox, 6)).toStrictEqual({
    remaining: inbox.slice(2),
    answered: [3, 5],
  });
});
