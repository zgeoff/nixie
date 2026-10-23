import { expect, test } from 'bun:test';
import { fillTemplate } from './fill-template';

test('it fills each path with its value, with or without spaces inside the braces', () => {
  expect(
    fillTemplate(
      'Hello {{ owner.name }}, from {{assistant.name}}.',
      new Map([
        ['owner.name', 'Ines'],
        ['assistant.name', 'Pip'],
      ]),
    ),
  ).toBe('Hello Ines, from Pip.');
});

test('it leaves the braces inside a value unfilled', () => {
  expect(
    fillTemplate(
      '{{ persona }}',
      new Map([
        ['persona', 'You are {{ owner.name }}.'],
        ['owner.name', 'Ines'],
      ]),
    ),
  ).toBe('You are {{ owner.name }}.');
});

test('it throws for a path that the prompt does not accept', () => {
  expect(() => fillTemplate('Hello {{ owner.title }}.', new Map([['owner.name', 'Ines']]))).toThrow(
    'the prompt accepts no path "owner.title"',
  );
});
