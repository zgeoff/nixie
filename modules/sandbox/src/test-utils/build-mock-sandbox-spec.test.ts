import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';

test('it builds a default sandbox spec', () => {
  expect(buildMockSandboxSpec()).toStrictEqual({
    kind: 'worker',
    image: expect.toBeString(),
    owner: expect.toBeString(),
    egress: { kind: 'none' },
    grants: [],
    toolRoute: true,
    limits: {
      vcpus: expect.toSatisfy((value: number) => Number.isInteger(value) && value > 0),
      memoryMiB: expect.toSatisfy((value: number) => Number.isInteger(value) && value > 0),
      diskMiB: expect.toSatisfy((value: number) => Number.isInteger(value) && value > 0),
    },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockSandboxSpec({ kind: 'fetch', egress: { kind: 'public' }, toolRoute: false }),
  ).toMatchObject({
    kind: 'fetch',
    egress: { kind: 'public' },
    grants: [],
    toolRoute: false,
  });
});

test('it merges a limits override into the default limits', () => {
  expect(buildMockSandboxSpec({ limits: { vcpus: 4 } }).limits).toStrictEqual({
    vcpus: 4,
    memoryMiB: expect.toSatisfy((value: number) => Number.isInteger(value) && value > 0),
    diskMiB: expect.toSatisfy((value: number) => Number.isInteger(value) && value > 0),
  });
});
