import { expect, test } from 'bun:test';
import type { SandboxCount } from '@heynixie/spend';
import { pickWorkerRefusal } from './pick-worker-refusal';

function setupTest() {
  return {
    buildCount: (lastRefusal: SandboxCount['lastRefusal']): SandboxCount => ({
      dollars: 0,
      tokens: 0,
      tripped: false,
      lastRefusal,
      limitRevision: 0,
    }),
  };
}

test.each([
  { name: 'no count', refusal: undefined },
  { name: 'no refusal', refusal: null },
  {
    name: 'a refusal at the sandbox limit',
    refusal: { counter: 'sandbox' as const, route: 'plan', provider: 'main', atMs: 500 },
  },
  {
    name: 'a refusal before the run began',
    refusal: { counter: 'provider_day' as const, route: 'plan', provider: 'main', atMs: 99 },
  },
])('#pickWorkerRefusal returns null for $name', (row) => {
  const ctx = setupTest();
  const count = row.refusal === undefined ? null : ctx.buildCount(row.refusal);

  expect(pickWorkerRefusal(count, 100)).toBeNull();
});

test('#pickWorkerRefusal names the counter, route and provider of a refusal since the run began', () => {
  const ctx = setupTest();

  const count = ctx.buildCount({
    counter: 'provider_month',
    route: 'plan',
    provider: 'main',
    atMs: 100,
  });

  expect(pickWorkerRefusal(count, 100)).toStrictEqual({
    counter: 'provider_month',
    route: 'plan',
    provider: 'main',
  });
});
