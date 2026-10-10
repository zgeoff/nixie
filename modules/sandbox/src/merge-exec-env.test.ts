import { expect, test } from 'bun:test';
import { mergeExecEnv } from './merge-exec-env';
import type { SandboxSpec } from './types';

const spec: SandboxSpec = {
  kind: 'worker',
  image: 'worker',
  owner: 'task-1:step-2',
  egress: { kind: 'none' },
  grants: [
    {
      secret: 'model',
      host: 'api.anthropic.com',
      env: { ANTHROPIC_API_KEY: 'broker-placeholder' },
    },
  ],
  toolRoute: true,
  limits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
};

test('it adds the grant placeholders and keeps the loopback on NO_PROXY', () => {
  expect(mergeExecEnv(spec, { NO_PROXY: 'example.com', FOO: 'bar' })).toStrictEqual({
    ANTHROPIC_API_KEY: 'broker-placeholder',
    FOO: 'bar',
    NO_PROXY: 'example.com,127.0.0.1,localhost',
    no_proxy: 'example.com,127.0.0.1,localhost',
  });
});

test('it sets NO_PROXY when the caller passes none', () => {
  expect(mergeExecEnv({ ...spec, grants: [] }, undefined)).toStrictEqual({
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
  });
});
