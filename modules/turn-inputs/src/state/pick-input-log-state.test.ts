import { expect, test } from 'bun:test';
import { turnInputLogConfigSchema } from '../turn-input-log-config-schema';
import { pickInputLogState } from './pick-input-log-state';

function setupTest() {
  return {
    always: turnInputLogConfigSchema.parse({}),
    off: turnInputLogConfigSchema.parse({ default: 'off' }),
  };
}

test('it is off with no section', () => {
  expect(pickInputLogState(null, { state: 'on', until: null }, 10)).toStrictEqual({
    state: 'off',
    until: null,
  });
});

test('it takes an always default with no set record', () => {
  const ctx = setupTest();

  expect(pickInputLogState(ctx.always, null, 10).state).toBe('on');
});

test('it takes an off default with no set record', () => {
  const ctx = setupTest();

  expect(pickInputLogState(ctx.off, null, 10).state).toBe('off');
});

test('it holds off past an always default until an on record', () => {
  const ctx = setupTest();

  expect(pickInputLogState(ctx.always, { state: 'off', until: null }, 10).state).toBe('off');
});

test('it stays on until its end', () => {
  const ctx = setupTest();

  expect(pickInputLogState(ctx.off, { state: 'on', until: 100 }, 99).state).toBe('on');
});

test('it is off from its end on', () => {
  const ctx = setupTest();

  expect(pickInputLogState(ctx.off, { state: 'on', until: 100 }, 100).state).toBe('off');
});
