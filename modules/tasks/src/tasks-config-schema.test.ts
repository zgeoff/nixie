import { expect, test } from 'bun:test';
import { tasksConfigSchema } from './tasks-config-schema';

test('it runs 3 task runners and stops waking an exchange at 20 hops by default', () => {
  expect(tasksConfigSchema.safeParse({}).data).toStrictEqual({
    runners: 3,
    messaging: { hopLimit: 20 },
  });
});

test('it takes the pool size the file names', () => {
  expect(tasksConfigSchema.safeParse({ runners: 5 }).data).toStrictEqual({
    runners: 5,
    messaging: { hopLimit: 20 },
  });
});

test('it takes the hop limit the file names', () => {
  expect(tasksConfigSchema.safeParse({ messaging: { hopLimit: 6 } }).data).toStrictEqual({
    runners: 3,
    messaging: { hopLimit: 6 },
  });
});

test('it refuses a hop limit of no hops', () => {
  const result = tasksConfigSchema.safeParse({ messaging: { hopLimit: 0 } });

  expect(result.error?.issues).toPartiallyContain({ path: ['messaging', 'hopLimit'] });
});

test('it refuses a pool of no runners', () => {
  const result = tasksConfigSchema.safeParse({ runners: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['runners'] });
});

test('it refuses an unknown key', () => {
  const result = tasksConfigSchema.safeParse({ runners: 5, runner: 5 });

  expect(result.error?.issues).toPartiallyContain({ path: [], keys: ['runner'] });
});
