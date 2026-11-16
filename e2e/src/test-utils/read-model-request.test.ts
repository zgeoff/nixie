import { expect, test } from 'bun:test';
import { readModelRequest } from './read-model-request';

test('it reads the 2 times of the since block in a request body', () => {
  const since =
    '<input name="since">Your previous run started at 1970-01-01T00:00:01.000Z. This run started at 1970-01-01T11:00:00.000Z. Read messages from the first time up to the second.</input>';

  const body = { messages: [{ role: 'user', content: [{ type: 'text', text: since }] }] };

  expect(readModelRequest(body).sinceTimes).toStrictEqual({
    from: '1970-01-01T00:00:01.000Z',
    to: '1970-01-01T11:00:00.000Z',
  });
});

test('it reads no since times from a body without the block', () => {
  expect(readModelRequest({ messages: [] }).sinceTimes).toBeNull();
});

test('it reads the event ID of the owner entry in a log.read result', () => {
  const page = JSON.stringify({
    entries: [
      { eventID: '5', role: 'assistant', text: 'Noted.' },
      { eventID: '4', role: 'owner', text: 'The kettle is new.' },
    ],
    next: null,
  });

  const body = { messages: [{ content: [{ type: 'tool_result', content: page }] }] };

  expect(readModelRequest(body).ownerEventID).toBe('4');
});

test('it reads no owner event ID when no result holds an owner entry', () => {
  expect(readModelRequest({ messages: [{ content: 'plain text' }] }).ownerEventID).toBeNull();
});

test('it reads the input of a named tool call', () => {
  const body = {
    messages: [
      { content: [{ type: 'tool_use', name: 'log_read', input: { from: 'a', to: 'b' } }] },
    ],
  };

  const reader = readModelRequest(body);

  expect(reader.readToolUseInput('log_read')).toStrictEqual({ from: 'a', to: 'b' });
  expect(reader.readToolUseInput('other')).toBeNull();
});
