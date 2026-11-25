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
