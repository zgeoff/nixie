import { expect, test } from 'bun:test';
import { formatMemoryProvenance } from './format-memory-provenance';

test.each([
  ['owner', 'owner', 'by you, from your own words'],
  ['conversation', 'owner', 'by the conversation, from your own words'],
  ['task', 'owner_data', 'by a task, from your data'],
  ['memory_writer', 'untrusted', 'by the memory writer, from outside content'],
] as const)('it describes a version written by %s from %s', (origin, source, expected) => {
  expect(formatMemoryProvenance(origin, source)).toBe(expected);
});
