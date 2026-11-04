import { expect, test } from 'bun:test';
import { parseServerMessage } from './parse-server-message.ts';

test.each([
  {
    title: 'a request',
    raw: { id: 'refresh-1', method: 'account/chatgptAuthTokens/refresh', params: { reason: 'unauthorized' } },
    expected: {
      kind: 'request',
      id: 'refresh-1',
      method: 'account/chatgptAuthTokens/refresh',
      params: { reason: 'unauthorized' },
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
    raw: { id: 4, error: { code: -32600, message: 'bad request' } },
    expected: { kind: 'error', id: 4, error: { code: -32600, message: 'bad request' } },
  },
])('it sorts $title', ({ raw, expected }) => {
  expect(parseServerMessage(raw)).toStrictEqual(expected);
});

test.each([
  { title: 'a reply with a string ID', raw: { id: 'reply-1', result: {} } },
  { title: 'a message with neither a method nor an ID', raw: { params: {} } },
  { title: 'a method that is not a string', raw: { method: 7 } },
  { title: 'an ID of null', raw: { id: null, result: {} } },
  { title: 'an array', raw: [] },
  { title: 'a string', raw: 'turn/started' },
])('it leaves $title unmatched', ({ raw }) => {
  expect(parseServerMessage(raw)).toStrictEqual({ kind: 'unmatched' });
});
