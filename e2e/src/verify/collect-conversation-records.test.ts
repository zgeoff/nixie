import { expect, test } from 'bun:test';
import { collectConversationRecords } from './collect-conversation-records';

test('it keeps the record lines and drops every other line', () => {
  const lines = [
    '{"event":"ready","web":"http://127.0.0.1:4100/"}',
    'a line that is not JSON',
    '{"event":"record","sequence":12,"kind":"owner_message","text":"Is the kettle on?"}',
  ];

  expect(collectConversationRecords(lines)).toStrictEqual([
    { event: 'record', sequence: 12, kind: 'owner_message', text: 'Is the kettle on?' },
  ]);
});
