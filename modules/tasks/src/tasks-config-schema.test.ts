import { expect, test } from 'bun:test';
import { tasksConfigSchema } from './tasks-config-schema';

test('it runs 3 task runners and 2 claim loops for started tasks, and stops waking an exchange at 20 hops by default', () => {
  expect(tasksConfigSchema.safeParse({}).data).toStrictEqual({
    runners: 3,
    startedClaimLoops: 2,
    messaging: { hopLimit: 20 },
  });
});

test('it takes the pool size the file names', () => {
  expect(tasksConfigSchema.safeParse({ runners: 5 }).data).toStrictEqual({
    runners: 5,
    startedClaimLoops: 2,
    messaging: { hopLimit: 20 },
  });
});

test('it takes the number of claim loops for started tasks the file names', () => {
  expect(tasksConfigSchema.safeParse({ startedClaimLoops: 4 }).data).toStrictEqual({
    runners: 3,
    startedClaimLoops: 4,
    messaging: { hopLimit: 20 },
  });
});

test('it takes the hop limit the file names', () => {
  expect(tasksConfigSchema.safeParse({ messaging: { hopLimit: 6 } }).data).toStrictEqual({
    runners: 3,
    startedClaimLoops: 2,
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

test('it refuses no claim loops for started tasks', () => {
  const result = tasksConfigSchema.safeParse({ startedClaimLoops: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['startedClaimLoops'] });
});

test('it refuses an unknown key', () => {
  const result = tasksConfigSchema.safeParse({ runners: 5, runner: 5 });

  expect(result.error?.issues).toPartiallyContain({ path: [], keys: ['runner'] });
});
