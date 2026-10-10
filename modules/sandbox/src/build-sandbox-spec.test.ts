import { expect, test } from 'bun:test';
import { buildSandboxSpec } from './build-sandbox-spec';
import { requireSandboxSpec } from './require-sandbox-spec';
import type { GrantSpec } from './types';

const modelGrant: GrantSpec = {
  secret: 'model-default',
  host: 'api.anthropic.com',
  env: { ANTHROPIC_API_KEY: 'broker-placeholder' },
};
const limits = { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 };

test('it builds each kind of work from the kinds table', () => {
  const specs = (['conversation', 'worker', 'code_run', 'fetch', 'coding'] as const).map((kind) =>
    buildSandboxSpec({
      kind,
      image: kind,
      owner: 'task-1:step-1',
      limits,
      modelGrant,
      allowHosts: ['github.com'],
    }),
  );

  expect(
    specs.map((spec) => ({
      kind: spec.kind,
      egress: spec.egress,
      grants: spec.grants.map((grant) => grant.secret),
      toolRoute: spec.toolRoute,
    })),
  ).toStrictEqual([
    { kind: 'conversation', egress: { kind: 'none' }, grants: ['model-default'], toolRoute: true },
    { kind: 'worker', egress: { kind: 'none' }, grants: ['model-default'], toolRoute: true },
    { kind: 'code_run', egress: { kind: 'none' }, grants: [], toolRoute: false },
    { kind: 'fetch', egress: { kind: 'public' }, grants: [], toolRoute: false },
    {
      kind: 'coding',
      egress: { kind: 'allow', hosts: ['github.com'] },
      grants: ['model-default'],
      toolRoute: true,
    },
  ]);
  for (const spec of specs) {
    expect(() => {
      requireSandboxSpec(spec);
    }).not.toThrow();
  }
});

test('it adds the extra grants of a coding session only', () => {
  const extra: GrantSpec = { secret: 'github', host: 'api.github.com', env: {} };

  expect(
    buildSandboxSpec({
      kind: 'worker',
      image: 'w',
      owner: 'o',
      limits,
      modelGrant,
      extraGrants: [extra],
    }).grants,
  ).toStrictEqual([modelGrant]);
  expect(
    buildSandboxSpec({
      kind: 'coding',
      image: 'c',
      owner: 'o',
      limits,
      modelGrant,
      allowHosts: ['github.com'],
      extraGrants: [extra],
    }).grants,
  ).toStrictEqual([modelGrant, extra]);
});
