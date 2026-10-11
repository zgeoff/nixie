import { expect, test } from 'bun:test';
import { actionsConfigSchema } from './actions-config-schema';

test('it runs 4 action runners by default', () => {
  expect(actionsConfigSchema.safeParse({}).data).toStrictEqual({ runners: 4 });
});

test('it takes the pool size the file names', () => {
  expect(actionsConfigSchema.safeParse({ runners: 2 }).data).toStrictEqual({ runners: 2 });
});

test('it refuses a pool of no runners', () => {
  const result = actionsConfigSchema.safeParse({ runners: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['runners'] });
});

test('it refuses an unknown key', () => {
  const result = actionsConfigSchema.safeParse({ runner: 2 });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys', keys: ['runner'] });
});
