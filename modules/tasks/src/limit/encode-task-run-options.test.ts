import { expect, test } from 'bun:test';
import { encodeTaskRunOptions } from './encode-task-run-options';
import { taskRunOptionsSchema } from './task-run-options-schema';

test('it stores the limits of a task with none as numbers, and reads them back as null', () => {
  const stored = encodeTaskRunOptions({
    model: null,
    profile: null,
    persona: 'none',
    memory: 'none',
    tools: [],
    report: 'wake',
    limits: { turns: null, dollars: 3 },
  });

  expect(stored).toStrictEqual({
    model: null,
    profile: null,
    persona: 'none',
    memory: 'none',
    log: 'own',
    tools: [],
    report: 'wake',
    limits: { turns: 1_000_000_000, dollars: 3 },
  });

  expect(taskRunOptionsSchema.parse(stored).limits).toStrictEqual({ turns: null, dollars: 3 });
});
