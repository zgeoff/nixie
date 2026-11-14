import { expect, test } from 'bun:test';
import { swapToolResultUUIDs } from './swap-tool-result-uuids';

test('it keeps a field named __proto__ of a stored result', () => {
  const lookup = { moment: new Map(), item: new Map(), change: new Map() };
  const result: unknown = JSON.parse('{"__proto__":{"text":"saved value"},"ok":true}');

  expect(JSON.stringify(swapToolResultUUIDs(result, lookup))).toBe(
    '{"__proto__":{"text":"saved value"},"ok":true}',
  );
});
