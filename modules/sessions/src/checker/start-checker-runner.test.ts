import { expect, test } from 'bun:test';
import { buildMockModelProfile } from '@heynixie/models/test-utils';
import {
  buildStubGuestSandboxes,
  buildStubSandboxes,
  setupTestRecorder,
} from '@heynixie/sandbox/test-utils';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import { buildTestClock } from '@heynixie/testing';
import { startCheckerRunner } from './start-checker-runner';

test('it starts the checker in a checker sandbox with a model grant, no egress and no tool route', async () => {
  const sandboxes = buildStubSandboxes();

  await startCheckerRunner({
    profile: { profile: buildMockModelProfile(), credential: 'not-a-real-key' },
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  expect(sandboxes.created).toMatchObject([
    {
      kind: 'checker',
      image: 'nixie-conversation-0123456789ab',
      owner: 'checker',
      egress: { kind: 'none' },
      grants: [{ env: { ANTHROPIC_API_KEY: 'nixie-broker-placeholder' } }],
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
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
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
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-ba9876543210',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  expect(sandboxes.created.map((spec) => spec.image)).toStrictEqual([
    'nixie-conversation-0123456789ab',
    'nixie-conversation-ba9876543210',
  ]);

  expect(sandboxes.destroyed).toHaveLength(1);
});

test('it logs a failed destroy of the old checker sandbox and still starts the checker', async () => {
  const sandboxes = buildStubSandboxes();
  const profile = { profile: buildMockModelProfile(), credential: 'not-a-real-key' };
  const events: string[] = [];

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  sandboxes.setDestroyError(new Error('the host is gone'));

  await startCheckerRunner({
    profile,
    sandboxes: sandboxes.adapter,
    image: 'nixie-conversation-ba9876543210',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    log: (event) => {
      events.push(event);
    },
  });

  expect(events).toStrictEqual(['sandbox.remove_failed']);

  expect(sandboxes.created.map((spec) => spec.image)).toStrictEqual([
    'nixie-conversation-0123456789ab',
    'nixie-conversation-ba9876543210',
  ]);
});

test('it sends a check to the base URL with the checker sandbox name and the profile ID when the gateway counts', async () => {
  const recorder = await setupTestRecorder();

  const guests = buildStubGuestSandboxes({
    recorder: recorder.recorder,
    countTokens: (text) => Math.ceil(text.length / 4),
  });

  guests.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  const profile = buildMockModelProfile({
    id: 'checker-profile',
    baseURL: 'https://models.example.test',
  });

  const check = await startCheckerRunner({
    profile: { profile, credential: 'not-a-real-key' },
    sandboxes: guests.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    gateway: buildStubSpendGateway(),
    log: () => {},
  });

  await check({ prompt: 'Check it.', input: 'I swim on Fridays' });

  const [sandbox] = await guests.adapter.list('checker');

  expect(guests.checks.map((request) => request.profile.baseURL)).toStrictEqual([
    `https://models.example.test/${sandbox?.id ?? ''}/checker-profile`,
  ]);
});

test('it sends a check to the base URL of the profile when no gateway counts', async () => {
  const recorder = await setupTestRecorder();

  const guests = buildStubGuestSandboxes({
    recorder: recorder.recorder,
    countTokens: (text) => Math.ceil(text.length / 4),
  });

  guests.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  const profile = buildMockModelProfile({
    id: 'checker-profile',
    baseURL: 'https://models.example.test',
  });

  const check = await startCheckerRunner({
    profile: { profile, credential: 'not-a-real-key' },
    sandboxes: guests.adapter,
    image: 'nixie-conversation-0123456789ab',
    limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
    command: { argv: ['bun', '--no-install', '/app/conversation/check.js'], env: {} },
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  await check({ prompt: 'Check it.', input: 'I swim on Fridays' });

  expect(guests.checks.map((request) => request.profile.baseURL)).toStrictEqual([
    'https://models.example.test',
  ]);
});
