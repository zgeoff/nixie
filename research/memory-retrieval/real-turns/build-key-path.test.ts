import { expect, test } from 'bun:test';
import { buildKeyPath } from './build-key-path.ts';

test.each([
  ['labels/sample.jsonl', 'labels/sample-key.jsonl'],
  ['labels/sample', 'labels/sample-key.jsonl'],
  ['labels/sample.JSONL', 'labels/sample.JSONL-key.jsonl'],
  ['labels/sample-key.jsonl', 'labels/sample-key-key.jsonl'],
])('it writes the key for %s to %s', (samplePath, keyPath) => {
  expect(buildKeyPath(samplePath)).toBe(keyPath);
});
