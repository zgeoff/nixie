import { expect, test } from 'bun:test';
import { buildMockSandbox } from '@heynixie/sandbox/test-utils';
import { pickSandboxPlan } from './pick-sandbox-plan';

test('it creates a sandbox when the task holds none', () => {
  const plan = pickSandboxPlan({ current: null, mayBeAsleep: false });

  expect(plan).toStrictEqual({ kind: 'create' });
});

test('it wakes a held sandbox that may sleep and that sleeps in memory', () => {
  const suspension = {
    kind: 'memory',
    sleep: () => Promise.resolve(),
    wake: () => Promise.resolve(),
  } as const;

  const sandbox = buildMockSandbox({ suspension });
  const plan = pickSandboxPlan({ current: sandbox, mayBeAsleep: true });

  expect(plan).toStrictEqual({ kind: 'use', sandbox, toWake: suspension });
});

test('it uses a held sandbox that is awake with no wake', () => {
  const sandbox = buildMockSandbox({
    suspension: { kind: 'memory', sleep: () => Promise.resolve(), wake: () => Promise.resolve() },
  });

  const plan = pickSandboxPlan({ current: sandbox, mayBeAsleep: false });

  expect(plan).toStrictEqual({ kind: 'use', sandbox, toWake: null });
});

test('it uses a held sandbox that may sleep but cannot suspend with no wake', () => {
  const sandbox = buildMockSandbox({ suspension: { kind: 'none' } });
  const plan = pickSandboxPlan({ current: sandbox, mayBeAsleep: true });

  expect(plan).toStrictEqual({ kind: 'use', sandbox, toWake: null });
});
