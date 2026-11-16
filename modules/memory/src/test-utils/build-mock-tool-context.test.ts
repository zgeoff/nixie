import { expect, test } from 'bun:test';
import { buildMockToolContext } from './build-mock-tool-context';

test('it builds a default tool context', () => {
  expect(buildMockToolContext()).toStrictEqual({
    run: {
      runID: expect.toBeString(),
      thread: 'conversation',
      logThread: 'conversation',
      tools: [],
      model: { model: expect.toStartWith('claude-'), profile: 'standard' },
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockToolContext({ thread: 'task-3', model: { model: 'model-a', profile: 'fast' } }),
  ).toStrictEqual({
    run: {
      runID: expect.toBeString(),
      thread: 'task-3',
      logThread: 'task-3',
      tools: [],
      model: { model: 'model-a', profile: 'fast' },
    },
  });
});

test('it carries the verdict it is given', () => {
  expect(buildMockToolContext({}, { kind: 'gate' }).verdict).toStrictEqual({ kind: 'gate' });
});
