import { expect, test } from 'bun:test';
import { buildMockToolContext } from './build-mock-tool-context';

test('it builds the context of a run on the conversation thread with no tools', () => {
  expect(buildMockToolContext()).toStrictEqual({
    run: {
      runID: expect.toSatisfy((runID: string) => /^[0-9a-f-]{36}$/u.test(runID)),
      thread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
  });
});

test('it builds the context of a run with the fields it is given', () => {
  expect(
    buildMockToolContext({ run: { runID: 'run-1', thread: 'task-1', tools: ['prompt_read'] } }),
  ).toStrictEqual({
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['prompt_read'],
      model: { model: 'test-model', profile: 'standard' },
    },
  });
});
