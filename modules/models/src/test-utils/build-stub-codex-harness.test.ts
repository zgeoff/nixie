import { expect, test } from 'bun:test';
import { harnessCapabilities } from '@heynixie/wire';
import { buildStubCodexHarness } from './build-stub-codex-harness';

test('it builds a record with the codex ID and capabilities and no session', () => {
  const harness = buildStubCodexHarness();

  expect({
    id: harness.id,
    capabilities: harness.capabilities,
    session: harness.session,
  }).toStrictEqual({
    id: 'codex',
    capabilities: harnessCapabilities.codex,
    session: null,
  });
});

test('it keeps an override', () => {
  expect(buildStubCodexHarness({ contextWindow: 123_000 }).contextWindow).toBe(123_000);
});
