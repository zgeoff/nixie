import { expect, test } from 'bun:test';
import { buildMockModelProfile } from '@heynixie/models/test-utils';
import { startCheckerRunner } from './start-checker-runner';
import { buildStubSandboxes } from './test-utils/build-stub-sandboxes';

test('it starts the checker in a checker sandbox with a model grant, no egress and no tool route', async () => {
  const sandboxes = buildStubSandboxes();

  await startCheckerRunner({
    profile: { profile: buildMockModelProfile(), credential: 'not-a-real-key' },
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '/app/guests/conversation/src/check.ts'], env: {} },
    log: () => {},
  });

  expect(sandboxes.created).toMatchObject([
    {
      kind: 'checker',
      image: 'nixie-conversation-0123456789ab',
      owner: 'checker',
      egress: { kind: 'none' },
      grants: [{ env: { ANTHROPIC_API_KEY: 'imp-broker-placeholder' } }],
      toolRoute: false,
    },
  ]);
});

test('it keeps the checker sandbox when its spec still matches', async () => {
  const sandboxes = buildStubSandboxes();
  const profile = { profile: buildMockModelProfile(), credential: 'not-a-real-key' };

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '/app/guests/conversation/src/check.ts'], env: {} },
    log: () => {},
  });

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '/app/guests/conversation/src/check.ts'], env: {} },
    log: () => {},
  });

  expect(sandboxes.created).toHaveLength(1);
  expect(sandboxes.destroyed).toStrictEqual([]);
});

test('it replaces the checker sandbox when the image changed', async () => {
  const sandboxes = buildStubSandboxes();
  const profile = { profile: buildMockModelProfile(), credential: 'not-a-real-key' };

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '/app/guests/conversation/src/check.ts'], env: {} },
    log: () => {},
  });

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-ba9876543210',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '/app/guests/conversation/src/check.ts'], env: {} },
    log: () => {},
  });

  expect(sandboxes.created.map((spec) => spec.image)).toStrictEqual([
    'nixie-conversation-0123456789ab',
    'nixie-conversation-ba9876543210',
  ]);

  expect(sandboxes.destroyed).toHaveLength(1);
});
