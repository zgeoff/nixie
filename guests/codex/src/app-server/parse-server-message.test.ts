import { expect, test } from 'bun:test';
import { parseServerMessage } from './parse-server-message';

test.each([
  {
    title: 'a request',
    raw: { id: 'approve-1', method: 'item/commandExecution/requestApproval', params: { name: 1 } },
    expected: {
      kind: 'request',
      id: 'approve-1',
      method: 'item/commandExecution/requestApproval',
      params: { name: 1 },
    },
  },
  {
    title: 'a notification',
    raw: { method: 'turn/started', params: { threadId: 'thread-a' } },
    expected: { kind: 'notification', method: 'turn/started', params: { threadId: 'thread-a' } },
  },
  {
    title: 'a result',
    raw: { id: 3, result: { thread: { id: 'thread-a' } } },
    expected: { kind: 'result', id: 3, result: { thread: { id: 'thread-a' } } },
  },
  {
    title: 'an error',
    raw: { id: 4, error: { code: 100, message: 'bad request' } },
    expected: { kind: 'error', id: 4, error: { code: 100, message: 'bad request' } },
  },
  {
    title: 'a reply under a string ID',
    raw: { id: 'reply-a', result: {} },
    expected: { kind: 'unmatched' },
  },
  { title: 'a value that is no object', raw: 'text', expected: { kind: 'unmatched' } },
])('it sorts $title', (row) => {
  expect(parseServerMessage(row.raw)).toStrictEqual(row.expected);
});
