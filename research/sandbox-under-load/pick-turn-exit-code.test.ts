import { expect, test } from 'bun:test';
import { pickTurnExitCode } from './pick-turn-exit-code';

test.each([
  ['a rotation turn that succeeds', 'rotation', true, false, 0],
  ['a rotation turn that ends on an authentication failure', 'rotation', false, true, 0],
  ['a rotation turn that fails another way', 'rotation', false, false, 1],
  ['a parallel turn that succeeds', 'parallel', true, false, 0],
  ['a parallel turn that ends on an authentication failure', 'parallel', false, true, 1],
  ['a parallel turn that fails another way', 'parallel', false, false, 1],
] as const)('it exits with the right code for %s', (_label, scenario, succeeded, authenticationFailed, code) => {
  expect(pickTurnExitCode({ scenario, succeeded, authenticationFailed })).toBe(code);
});
