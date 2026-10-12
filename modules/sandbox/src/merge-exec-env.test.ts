import { expect, test } from 'bun:test';
import { mergeExecEnv } from './merge-exec-env';
import { buildMockGrantSpec } from './test-utils/build-mock-grant-spec';
import { buildMockSandboxSpec } from './test-utils/build-mock-sandbox-spec';

test('it adds the grant placeholders and keeps the loopback on NO_PROXY', () => {
  const spec = buildMockSandboxSpec({
    grants: [buildMockGrantSpec({ env: { ANTHROPIC_API_KEY: 'broker-placeholder' } })],
  });

  expect(mergeExecEnv(spec, { NO_PROXY: 'example.com', FOO: 'bar' })).toStrictEqual({
    ANTHROPIC_API_KEY: 'broker-placeholder',
    FOO: 'bar',
    NO_PROXY: 'example.com,127.0.0.1,localhost',
    no_proxy: 'example.com,127.0.0.1,localhost',
  });
});

test('it sets NO_PROXY when the caller passes none', () => {
  expect(mergeExecEnv(buildMockSandboxSpec({ grants: [] }), undefined)).toStrictEqual({
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
  });
});
