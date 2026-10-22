import { expect, test } from 'bun:test';
import { renderTemplate } from './render-template';

test('it fills each placeholder with its value, as often as it appears', () => {
  expect(
    renderTemplate('{skill}: {operation} {skill}', { skill: 'tide-tables', operation: 'add' }),
  ).toBe('tide-tables: add tide-tables');
});

test('it leaves a placeholder inside a value as it is', () => {
  expect(renderTemplate('{owner} and {agent}', { owner: '{agent}', agent: 'Wren' })).toBe(
    '{agent} and Wren',
  );
});

test('it keeps a template with no placeholder as it is', () => {
  expect(renderTemplate('Add a skill', {})).toBe('Add a skill');
});
