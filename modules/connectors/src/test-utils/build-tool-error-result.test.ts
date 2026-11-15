import { expect, test } from 'bun:test';
import { buildToolErrorResult } from './build-tool-error-result';

test('it builds an error result that holds the message as text', () => {
  expect(buildToolErrorResult('No file f8k2m4q9za belongs to this thread.')).toStrictEqual({
    content: [{ type: 'text', text: 'No file f8k2m4q9za belongs to this thread.' }],
    isError: true,
  });
});
