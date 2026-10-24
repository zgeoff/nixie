import { expect, test } from 'bun:test';
import { buildMockToolCall } from './build-mock-tool-call';

test('it builds a call with no input and no tool use', () => {
  expect(buildMockToolCall()).toStrictEqual({
    callID: expect.toSatisfy((callID: string) => /^[0-9a-f-]{36}$/u.test(callID)),
    tool: expect.toSatisfy((tool: string) => /^[a-z]{12}$/u.test(tool)),
    input: {},
    toolUseID: null,
  });
});

test('it builds a call with the fields it is given', () => {
  expect(
    buildMockToolCall({
      callID: 'call-1',
      tool: 'prompt_read',
      input: { id: 'compaction' },
      toolUseID: 'use-1',
    }),
  ).toStrictEqual({
    callID: 'call-1',
    tool: 'prompt_read',
    input: { id: 'compaction' },
    toolUseID: 'use-1',
  });
});
