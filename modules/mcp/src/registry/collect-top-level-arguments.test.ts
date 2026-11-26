import { expect, test } from 'bun:test';
import { collectTopLevelArguments } from './collect-top-level-arguments';

test('it lists the arguments that a ref names and those that sit beside it', () => {
  const schema = {
    type: 'object',
    $defs: { base: { type: 'object', properties: { name: { type: 'string' } } } },
    $ref: '#/$defs/base',
    properties: { note: { type: 'string' } },
  };

  expect([...collectTopLevelArguments(schema)]).toStrictEqual(['name', 'note']);
});
