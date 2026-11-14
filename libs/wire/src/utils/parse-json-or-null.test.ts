import { expect, test } from 'bun:test';
import { parseJSONOrNull } from './parse-json-or-null';

test('it parses JSON text', () => {
  expect(parseJSONOrNull('{"type":"message_stop"}')).toStrictEqual({ type: 'message_stop' });
});

test('it reads text that is not JSON as null', () => {
  expect(parseJSONOrNull('{"type":')).toBeNull();
});
