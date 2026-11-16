import { expect, test } from 'bun:test';
import { isCompactionRequest } from './is-compaction-request';

test('it accepts a request whose input holds the compaction prompt', () => {
  const input = [
    {
      type: 'message',
      content: [
        { type: 'input_text', text: 'You are performing a CONTEXT CHECKPOINT COMPACTION.' },
      ],
    },
  ];

  expect(isCompactionRequest({ input })).toBeTrue();
});

test('it refuses a request whose input holds an ordinary message', () => {
  const input = [{ type: 'message', content: [{ type: 'input_text', text: 'Hello.' }] }];

  expect(isCompactionRequest({ input })).toBeFalse();
});
