import { expect, test } from 'bun:test';
import { taskRunOptionsSchema } from './task-run-options-schema';

function setupTest() {
  return {
    buildStoredOptions: (extra: Record<string, unknown>) => ({
      model: null,
      profile: null,
      persona: 'none',
      memory: 'none',
      tools: ['tasks.list'],
      report: 'wake',
      limits: { turns: 25, dollars: 2 },
      ...extra,
    }),
  };
}

test('it decodes stored options with no log key as the own log', () => {
  const ctx = setupTest();

  expect(taskRunOptionsSchema.parse(ctx.buildStoredOptions({})).log).toBe('own');
});

test('it decodes the conversation log', () => {
  const ctx = setupTest();

  expect(taskRunOptionsSchema.parse(ctx.buildStoredOptions({ log: 'conversation' })).log).toBe(
    'conversation',
  );
});

test('it fails to decode a log value outside own and conversation', () => {
  const ctx = setupTest();

  expect(
    taskRunOptionsSchema.safeParse(ctx.buildStoredOptions({ log: 'everything' })).success,
  ).toBe(false);
});
