import { expect, test } from 'bun:test';
import { requireSandboxSpec } from './require-sandbox-spec';
import { SandboxSpecRefusedError } from './sandbox-spec-refused-error';
import { buildMockGrantSpec } from './test-utils/build-mock-grant-spec';
import { buildMockSandboxSpec } from './test-utils/build-mock-sandbox-spec';

test('it accepts a model loop with a grant and no egress', () => {
  const spec = buildMockSandboxSpec({
    kind: 'worker',
    egress: { kind: 'none' },
    grants: [buildMockGrantSpec()],
  });

  expect(() => {
    requireSandboxSpec(spec);
  }).not.toThrow();
});

test.each(['conversation', 'worker', 'code_run', 'fetch', 'coding'] as const)(
  'it refuses public egress with a grant for a %s sandbox',
  (kind) => {
    const spec = buildMockSandboxSpec({
      kind,
      egress: { kind: 'public' },
      grants: [buildMockGrantSpec()],
    });

    expect(() => {
      requireSandboxSpec(spec);
    }).toThrow(new SandboxSpecRefusedError('public egress with a grant'));
  },
);

test.each(['conversation', 'worker', 'code_run', 'fetch'] as const)(
  'it refuses a grant with allowed egress outside a coding session, for a %s sandbox',
  (kind) => {
    const spec = buildMockSandboxSpec({
      kind,
      egress: { kind: 'allow', hosts: ['github.com'] },
      grants: [buildMockGrantSpec()],
    });

    expect(() => {
      requireSandboxSpec(spec);
    }).toThrow(
      new SandboxSpecRefusedError(`a grant with egress outside a coding session (${kind})`),
    );
  },
);

test('it accepts a coding session with a grant and allowed egress', () => {
  const spec = buildMockSandboxSpec({
    kind: 'coding',
    egress: { kind: 'allow', hosts: ['github.com'] },
    grants: [buildMockGrantSpec()],
  });

  expect(() => {
    requireSandboxSpec(spec);
  }).not.toThrow();
});

test('it accepts public egress with no grant', () => {
  const spec = buildMockSandboxSpec({ kind: 'fetch', egress: { kind: 'public' }, grants: [] });

  expect(() => {
    requireSandboxSpec(spec);
  }).not.toThrow();
});

test('it refuses a spec with no owner', () => {
  const spec = buildMockSandboxSpec({ owner: '' });

  expect(() => {
    requireSandboxSpec(spec);
  }).toThrow(new SandboxSpecRefusedError('no owner'));
});

test.each([
  ['a zero', { vcpus: 0 }],
  ['a negative', { memoryMiB: -1 }],
  ['a fractional', { diskMiB: 1.5 }],
] as const)('it refuses a spec with %s limit', (_label, limits) => {
  const spec = buildMockSandboxSpec({ limits });

  expect(() => {
    requireSandboxSpec(spec);
  }).toThrow(new SandboxSpecRefusedError('limits must be positive whole numbers'));
});

test('it refuses allowed egress with no hosts', () => {
  const spec = buildMockSandboxSpec({ kind: 'coding', egress: { kind: 'allow', hosts: [] } });

  expect(() => {
    requireSandboxSpec(spec);
  }).toThrow(new SandboxSpecRefusedError('allowed egress with no hosts'));
});
