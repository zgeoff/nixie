import { expect, test } from 'bun:test';
import type { SandboxCount } from '../types';
import { isStepRefusal } from './is-step-refusal';

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
  {
    name: 'a day refusal of the route since the step began',
    refusal: { counter: 'route_day', route: 'plan', provider: 'main', atMs: 2000 },
    expected: true,
  },
  {
    name: 'a month refusal of the route since the step began',
    refusal: { counter: 'route_month', route: 'plan', provider: 'main', atMs: 1000 },
    expected: true,
  },
  {
    name: 'a refusal before the step began',
    refusal: { counter: 'route_day', route: 'plan', provider: 'main', atMs: 999 },
    expected: false,
  },
  {
    name: 'a refusal of another route',
    refusal: { counter: 'route_day', route: 'metered', provider: 'main', atMs: 2000 },
    expected: false,
  },
  {
    name: "a refusal at the sandbox's own limit",
    refusal: { counter: 'sandbox', route: 'plan', provider: 'main', atMs: 2000 },
    expected: false,
  },
  {
    name: 'a provider day refusal of the route since the step began',
    refusal: { counter: 'provider_day', route: 'plan', provider: 'main', atMs: 2000 },
    expected: true,
  },
  { name: 'no refusal', refusal: null, expected: false },
] as const)('#isStepRefusal answers $expected for $name', (row) => {
  const ctx = setupTest();

  expect(isStepRefusal(ctx.buildCount(row.refusal), 'plan', 1000)).toBe(row.expected);
});
