import { expect, test } from 'bun:test';
import { tasksConfigSchema } from './tasks-config-schema';

test('it runs 3 task runners by default', () => {
  expect(tasksConfigSchema.safeParse({}).data).toStrictEqual({ runners: 3 });
});

test('it takes the pool size the file names', () => {
  expect(tasksConfigSchema.safeParse({ runners: 5 }).data).toStrictEqual({ runners: 5 });
});

test('it refuses a pool of no runners', () => {
  const result = tasksConfigSchema.safeParse({ runners: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['runners'] });
});

test('it refuses an unknown key', () => {
  const result = tasksConfigSchema.safeParse({ runners: 5, runner: 5 });

  expect(result.error?.issues).toPartiallyContain({ path: [], keys: ['runner'] });
});
