import { expect, test } from 'bun:test';
import { isContextOverflow } from './is-context-overflow';

test('it reads a turn the CLI refused past its window as an overflow', () => {
  expect(isContextOverflow({ terminalReason: 'blocking_limit' })).toBeTrue();
});

test('it reads a turn the model API refused past its window as an overflow', () => {
  expect(isContextOverflow({ terminalReason: 'prompt_too_long' })).toBeTrue();
});

test('it reads a turn that ended at another model API error as no overflow', () => {
  expect(isContextOverflow({ terminalReason: 'api_error' })).toBeFalse();
});

test('it reads a turn from a guest that sends no reason as no overflow', () => {
  expect(isContextOverflow({})).toBeFalse();
});
