import { expect, test } from 'bun:test';
import { hasAddedProperty } from './has-added-property';

test('it finds no added property in an identical schema', () => {
  const schema = { type: 'object', properties: { id: { type: 'string' } } };

  expect(hasAddedProperty(schema, structuredClone(schema))).toBe(false);
});

test('it finds no added property when a description changes', () => {
  const before = { type: 'object', properties: { id: { type: 'string' } } };

  const after = {
    type: 'object',
    properties: { id: { type: 'string', description: 'The item ID' } },
  };

  expect(hasAddedProperty(before, after)).toBe(false);
});

test('it finds no added property when a property is dropped', () => {
  const before = {
    type: 'object',
    properties: { id: { type: 'string' }, note: { type: 'string' } },
  };

  expect(hasAddedProperty(before, { type: 'object', properties: { id: { type: 'string' } } })).toBe(
    false,
  );
});

test('it finds a property added at the top', () => {
  const before = { type: 'object', properties: { id: { type: 'string' } } };

  const after = {
    type: 'object',
    properties: { id: { type: 'string' }, assignee: { type: 'string' } },
  };

  expect(hasAddedProperty(before, after)).toBe(true);
});

test('it finds a property added inside a nested object', () => {
  const before = {
    type: 'object',
    properties: { filter: { type: 'object', properties: { state: { type: 'string' } } } },
  };

  const after = {
    type: 'object',
    properties: {
      filter: {
        type: 'object',
        properties: { state: { type: 'string' }, owner: { type: 'string' } },
      },
    },
  };

  expect(hasAddedProperty(before, after)).toBe(true);
});

test('it finds a property added inside an array item', () => {
  const before = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
    },
  };

  const after = {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, color: { type: 'string' } },
        },
      },
    },
  };

  expect(hasAddedProperty(before, after)).toBe(true);
});

test('it finds a property in a definition that is new', () => {
  const before = { type: 'object', properties: { id: { type: 'string' } } };

  const after = {
    type: 'object',
    properties: { id: { type: 'string' } },
    $defs: { extra: { properties: { x: {} } } },
  };

  expect(hasAddedProperty(before, after)).toBe(true);
});
