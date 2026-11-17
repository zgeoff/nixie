import { expect, test } from 'bun:test';
import { hasDuplicateKey } from './has-duplicate-key';

test.each([
  ['a top-level key', '{"model":"model-small","model":"model-large"}'],
  [
    'a key in a tool entry',
    '{"tools":[{"name":"ask","type":"function","type":"image_generation"}]}',
  ],
  [
    'a key in a nested object',
    '{"provider":{"order":["a"],"allow_fallbacks":false,"order":["b"]}}',
  ],
  ['a key spelled once with an escape', String.raw`{"fallbacks":[],"fallbacks":["model-large"]}`],
  ['a key after a string that holds an escaped quote', String.raw`{"a":"x\"y","a":1}`],
])('it finds %s named twice', (_title, text) => {
  expect(hasDuplicateKey(text)).toBeTrue();
});

test.each([
  ['an object with distinct keys', '{"model":"model-small","stream":true}'],
  ['the same key in sibling objects', '{"tools":[{"type":"function"},{"type":"custom"}]}'],
  ['the same key in a parent and a child', '{"type":"a","inner":{"type":"b"}}'],
  ['a key repeated as a string value', '{"model":"model","name":"model"}'],
  ['a brace inside a string', String.raw`{"text":"{\"model\":1}","model":"model-small"}`],
  ['an array of strings after a key', '{"order":["model","model"],"model":"model-small"}'],
  ['a value that is not an object', '["model","model"]'],
])('it finds no repeated key in %s', (_title, text) => {
  expect(hasDuplicateKey(text)).toBeFalse();
});
