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
      [{ name: 'recipe', choices: ['recipe', 'preview'] }],
      ['--verbose', 'recipe'],
    ),
  ).toStrictEqual({ isValid: false, usage: 'usage: check-sign-in-code.ts <recipe|preview>' });
});

test('it accepts a value among the choices', () => {
  expect(
    parseStepCommand(
      'check-sign-in-code.ts',
      [{ name: 'recipe', choices: ['recipe', 'preview'] }],
      ['preview'],
    ),
  ).toStrictEqual({ isValid: true, values: ['preview'] });
});

test('it refuses a value outside the choices', () => {
  expect(
    parseStepCommand(
      'check-sign-in-code.ts',
      [{ name: 'recipe', choices: ['recipe', 'preview'] }],
      ['staging'],
    ),
  ).toStrictEqual({ isValid: false, usage: 'usage: check-sign-in-code.ts <recipe|preview>' });
});

test('it refuses a command that leaves out a required argument', () => {
  expect(parseStepCommand('tag-images.ts', [{ name: 'version' }], [])).toStrictEqual({
    isValid: false,
    usage: 'usage: tag-images.ts <version>',
  });
});

test('it accepts a command that leaves out an optional argument', () => {
  expect(
    parseStepCommand(
      'tag-images.ts',
      [{ name: 'version' }, { name: 'note', isOptional: true }],
      ['1.2.3'],
    ),
  ).toStrictEqual({ isValid: true, values: ['1.2.3'] });
});
