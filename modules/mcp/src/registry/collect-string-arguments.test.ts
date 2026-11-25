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

test('it lists a string argument that a local ref names', () => {
  const schema = {
    type: 'object',
    properties: { owner: { $ref: '#/$defs/name' }, team: { $ref: '#/$defs/team' } },
    $defs: {
      name: { type: 'string' },
      team: { type: 'object', properties: { lead: { $ref: '#/$defs/name' } } },
    },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['owner', 'team.lead']);
});

test('it ends the walk of a schema that refers to itself', () => {
  const schema = {
    type: 'object',
    properties: { node: { $ref: '#/$defs/node' } },
    $defs: {
      node: {
        type: 'object',
        properties: { label: { type: 'string' }, next: { $ref: '#/$defs/node' } },
      },
    },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['node.label']);
});

test('it lists each string of a tuple', () => {
  const schema = {
    type: 'object',
    properties: { pair: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }] } },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['pair[]']);
});

test('it lists an argument that is a string enum with no type', () => {
  const schema = {
    type: 'object',
    properties: { color: { enum: ['red', 'blue'] }, count: { enum: [1] } },
  };

  expect(collectStringArguments(schema)).toStrictEqual(['color']);
});
