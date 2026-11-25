import { expect, test } from 'bun:test';
import { collectStringArguments } from './collect-string-arguments';

test('it lists each string argument at the top', () => {
  const schema = {
    type: 'object',
    properties: { title: { type: 'string' }, count: { type: 'integer' }, body: { type: 'string' } },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['title', 'body']);
});

test('it lists a string argument inside a nested object and inside array items', () => {
  const schema = {
    type: 'object',
    properties: {
      filter: { type: 'object', properties: { owner: { type: 'string' } } },
      tags: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' } } },
      },
    },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['filter.owner', 'tags[].name']);
});

test('it lists an argument whose type allows a string', () => {
  const schema = { type: 'object', properties: { note: { type: ['string', 'null'] } } };

  expect(collectStringArguments(schema)).toStrictEqual(['note']);
});

test('it lists nothing for a schema with no properties', () => {
  expect(collectStringArguments({ type: 'object' })).toStrictEqual([]);
});

test('it lists an array whose items are strings', () => {
  const schema = {
    type: 'object',
    properties: { tags: { type: 'array', items: { type: 'string' } } },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['tags[]']);
});

test('it lists a string inside a union of schemas', () => {
  const schema = {
    type: 'object',
    properties: {
      owner: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      note: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
      target: { allOf: [{ type: 'object', properties: { name: { type: 'string' } } }] },
    },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['owner', 'note', 'target.name']);
});

test('it lists the free keys of an object whose values are strings', () => {
  const schema = {
    type: 'object',
    properties: { labels: { type: 'object', additionalProperties: { type: 'string' } } },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['labels.*']);
});

test('it lists a string argument of an object schema that has no type', () => {
  const schema = { properties: { title: { type: 'string' } } };

  expect(collectStringArguments(schema)).toStrictEqual(['title']);
});
