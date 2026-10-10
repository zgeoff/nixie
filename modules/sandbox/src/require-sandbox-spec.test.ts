import { expect, test } from 'bun:test';
import { requireSandboxSpec } from './require-sandbox-spec';
import { SandboxSpecRefusedError } from './sandbox-spec-refused-error';
import type { GrantSpec, SandboxSpec } from './types';

const modelGrant: GrantSpec = {
  secret: 'model-default',
  host: 'api.anthropic.com',
  env: { ANTHROPIC_API_KEY: 'broker-placeholder' },
};

const workerSpec: SandboxSpec = {
  kind: 'worker',
  image: 'worker',
  owner: 'task-1:step-2',
  egress: { kind: 'none' },
  grants: [modelGrant],
  toolRoute: true,
  limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
};

test('it accepts a model loop with a grant and no egress', () => {
  expect(() => {
    requireSandboxSpec(workerSpec);
  }).not.toThrow();
});

test.each(['conversation', 'worker', 'code_run', 'fetch', 'coding'] as const)(
  'it refuses public egress with a grant for a %s sandbox',
  (kind) => {
    expect(() => {
      requireSandboxSpec({ ...workerSpec, kind, egress: { kind: 'public' } });
    }).toThrow(new SandboxSpecRefusedError('public egress with a grant'));
  },
);

test.each(['conversation', 'worker', 'code_run', 'fetch'] as const)(
  'it refuses a grant with allowed egress outside a coding session, for a %s sandbox',
  (kind) => {
    expect(() => {
      requireSandboxSpec({ ...workerSpec, kind, egress: { kind: 'allow', hosts: ['github.com'] } });
    }).toThrow(
      new SandboxSpecRefusedError(`a grant with egress outside a coding session (${kind})`),
    );
  },
);

test('it accepts a coding session with a grant and allowed egress', () => {
  expect(() => {
    requireSandboxSpec({
      ...workerSpec,
      kind: 'coding',
      egress: { kind: 'allow', hosts: ['github.com'] },
    });
  }).not.toThrow();
});

test('it accepts public egress with no grant', () => {
  expect(() => {
    requireSandboxSpec({ ...workerSpec, kind: 'fetch', egress: { kind: 'public' }, grants: [] });
  }).not.toThrow();
});

test.each([
  [{ ...workerSpec, owner: '' }, 'no owner'],
  [
    { ...workerSpec, limits: { vcpus: 0, memoryMiB: 1, diskMiB: 1 } },
    'limits must be positive whole numbers',
  ],
  [
    { ...workerSpec, kind: 'coding', egress: { kind: 'allow', hosts: [] } },
    'allowed egress with no hosts',
  ],
] as const)('it refuses a malformed spec: %#', (spec, reason) => {
  expect(() => {
    requireSandboxSpec(spec);
  }).toThrow(new SandboxSpecRefusedError(reason));
});
