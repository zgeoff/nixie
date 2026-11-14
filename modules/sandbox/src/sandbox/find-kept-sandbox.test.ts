import { expect, test } from 'bun:test';
import { buildMockSandbox } from '../test-utils/build-mock-sandbox';
import { buildMockSandboxSpec } from '../test-utils/build-mock-sandbox-spec';
import { findKeptSandbox } from './find-kept-sandbox';

test('it keeps the sandbox whose spec matches', () => {
  const spec = buildMockSandboxSpec();
  const other = buildMockSandbox({ spec: buildMockSandboxSpec({ owner: spec.owner }) });
  const kept = buildMockSandbox({ spec: { ...spec } });

  expect(findKeptSandbox([other, kept], spec)).toBe(kept);
});

test('it keeps no sandbox that its adapter retired, though its spec matches', () => {
  const spec = buildMockSandboxSpec();
  const retired = buildMockSandbox({ spec, isRetired: true });

  expect(findKeptSandbox([retired], spec)).toBeUndefined();
});

test('it keeps the sandbox that replaced a retired one with the same spec', () => {
  const spec = buildMockSandboxSpec();
  const retired = buildMockSandbox({ spec, isRetired: true });
  const replacement = buildMockSandbox({ spec });

  expect(findKeptSandbox([retired, replacement], spec)).toBe(replacement);
});

test("it keeps no sandbox whose spec holds another release's guest image", () => {
  const spec = buildMockSandboxSpec({ image: 'conversation:release-1' });
  const started = buildMockSandbox({ spec });

  expect(findKeptSandbox([started], { ...spec, image: 'conversation:release-2' })).toBeUndefined();
});
