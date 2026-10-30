import { expect, test } from 'bun:test';
import { parseStepCommand } from './parse-step-command.ts';

test('it accepts a command with no arguments when the step takes none', () => {
  expect(parseStepCommand('check-health-url.ts', [], [])).toStrictEqual({
    isValid: true,
    values: [],
  });
});

test('it refuses an extra argument', () => {
  expect(parseStepCommand('check-health-url.ts', [], ['8080'])).toStrictEqual({
    isValid: false,
    usage: 'usage: check-health-url.ts',
  });
});

test('it refuses a flag', () => {
  expect(
    parseStepCommand(
      'check-sign-in-code.ts',
      [{ choices: ['recipe', 'preview'] }],
      ['--verbose', 'recipe'],
    ),
  ).toStrictEqual({ isValid: false, usage: 'usage: check-sign-in-code.ts <recipe|preview>' });
});

test('it accepts a value among the choices', () => {
  expect(
    parseStepCommand('check-sign-in-code.ts', [{ choices: ['recipe', 'preview'] }], ['preview']),
  ).toStrictEqual({ isValid: true, values: ['preview'] });
});

test('it refuses a value outside the choices', () => {
  expect(
    parseStepCommand('check-sign-in-code.ts', [{ choices: ['recipe', 'preview'] }], ['staging']),
  ).toStrictEqual({ isValid: false, usage: 'usage: check-sign-in-code.ts <recipe|preview>' });
});

test('it refuses a command that leaves out an argument', () => {
  expect(
    parseStepCommand('check-sign-in-code.ts', [{ choices: ['recipe', 'preview'] }], []),
  ).toStrictEqual({ isValid: false, usage: 'usage: check-sign-in-code.ts <recipe|preview>' });
});
