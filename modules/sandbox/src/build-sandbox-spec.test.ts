import { expect, test } from 'bun:test';
import { buildSandboxSpec } from './build-sandbox-spec';
import { requireSandboxSpec } from './require-sandbox-spec';
import { buildMockGrantSpec } from './test-utils/build-mock-grant-spec';

test.each([
  ['conversation', { kind: 'none' }, true],
  ['checker', { kind: 'none' }, false],
  ['worker', { kind: 'none' }, true],
  ['coding', { kind: 'allow', hosts: ['github.com'] }, true],
] as const)(
  'it builds a %s spec with the model grant from the kinds table',
  (kind, egress, toolRoute) => {
    const modelGrant = buildMockGrantSpec();

    expect(
      buildSandboxSpec({
        kind,
        image: 'image-a',
        owner: 'task-1:step-1',
        limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
        modelGrant,
        allowHosts: ['github.com'],
      }),
    ).toStrictEqual({
      kind,
      image: 'image-a',
      owner: 'task-1:step-1',
      egress,
      grants: [modelGrant],
      toolRoute,
      limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
    });
  },
);

test.each([
  ['code_run', { kind: 'none' }, false],
  ['fetch', { kind: 'public' }, false],
] as const)('it builds a %s spec with no grant from the kinds table', (kind, egress, toolRoute) => {
  expect(
    buildSandboxSpec({
      kind,
      image: 'image-a',
      owner: 'task-1:step-1',
      limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
      modelGrant: buildMockGrantSpec(),
      allowHosts: ['github.com'],
    }),
  ).toStrictEqual({
    kind,
    image: 'image-a',
    owner: 'task-1:step-1',
    egress,
    grants: [],
    toolRoute,
    limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
  });
});

test.each(['conversation', 'worker', 'code_run', 'fetch', 'coding'] as const)(
  'it builds a %s spec that the spec rule accepts',
  (kind) => {
    const spec = buildSandboxSpec({
      kind,
      image: 'image-a',
      owner: 'task-1:step-1',
      limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
      modelGrant: buildMockGrantSpec(),
      allowHosts: ['github.com'],
    });

    expect(() => {
      requireSandboxSpec(spec);
    }).not.toThrow();
  },
);

test('it adds the extra grants to a coding session', () => {
  const modelGrant = buildMockGrantSpec();
  const extra = buildMockGrantSpec();

  expect(
    buildSandboxSpec({
      kind: 'coding',
      image: 'image-a',
      owner: 'task-1:step-1',
      limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
      modelGrant,
      allowHosts: ['github.com'],
      extraGrants: [extra],
    }).grants,
  ).toStrictEqual([modelGrant, extra]);
});

test('it leaves the extra grants out of a worker', () => {
  const modelGrant = buildMockGrantSpec();

  expect(
    buildSandboxSpec({
      kind: 'worker',
      image: 'image-a',
      owner: 'task-1:step-1',
      limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
      modelGrant,
      extraGrants: [buildMockGrantSpec()],
    }).grants,
  ).toStrictEqual([modelGrant]);
});
