import { expect, test } from 'bun:test';
import { turnInputLogConfigSchema } from '../turn-input-log-config-schema';
import type { CapturePlanInput } from './pick-capture-plan';
import { pickCapturePlan } from './pick-capture-plan';

function setupTest() {
  const config = turnInputLogConfigSchema.parse({
    sources: {
      // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the key of the deployment's config
      gateway: { base_url: 'https://gw.example.test', dir: '/spool' },
    },
  });

  const input: CapturePlanInput = {
    config,
    isOn: true,
    role: 'task',
    profile: { harness: 'agent-sdk', baseURL: 'https://gw.example.test/claude' },
    answers: new Map([['gateway', true]]),
  };

  return { input };
}

test('it captures a task step of a profile behind a source that can capture', () => {
  const ctx = setupTest();

  expect(pickCapturePlan(ctx.input)).toStrictEqual({
    kind: 'capture',
    name: 'gateway',
    directory: '/spool',
  });
});

test('it takes no capture and no miss with no section', () => {
  const ctx = setupTest();

  expect(pickCapturePlan({ ...ctx.input, config: null })).toStrictEqual({ kind: 'none' });
});

test('it takes no capture and no miss with the log off', () => {
  const ctx = setupTest();

  expect(pickCapturePlan({ ...ctx.input, isOn: false })).toStrictEqual({ kind: 'none' });
});

test('it takes no capture and no miss for a role outside the roles', () => {
  const ctx = setupTest();

  expect(pickCapturePlan({ ...ctx.input, role: 'memory-writer' })).toStrictEqual({ kind: 'none' });
});

test('it misses when no source matches the profile', () => {
  const ctx = setupTest();
  const profile = { harness: 'agent-sdk', baseURL: 'https://gw.example.test.evil.test' } as const;

  expect(pickCapturePlan({ ...ctx.input, profile })).toStrictEqual({ kind: 'miss' });
});

test('it misses when the gateway answered no', () => {
  const ctx = setupTest();

  const answers = new Map([['gateway', false]]);

  expect(pickCapturePlan({ ...ctx.input, answers })).toStrictEqual({ kind: 'miss' });
});

test('it misses for a codex profile', () => {
  const ctx = setupTest();
  const profile = { harness: 'codex', baseURL: 'https://gw.example.test/codex' } as const;

  expect(pickCapturePlan({ ...ctx.input, profile })).toStrictEqual({ kind: 'miss' });
});
