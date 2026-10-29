import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { parseSensitiveRecord } from './parse-sensitive-record';

test.each([
  ['marks', true],
  ['clears', false],
] as const)('it reads a mark that %s an item', (_label, isSensitive) => {
  const record = buildMockLogRecord({
    kind: 'memory.sensitive_marked',
    payload: { itemID: 'item-a', isSensitive },
  });

  expect(parseSensitiveRecord(record)).toStrictEqual({
    target: 'item',
    itemID: 'item-a',
    isSensitive,
  });
});

test('it reads the mark of a proposal', () => {
  const record = buildMockLogRecord({
    kind: 'memory.proposal_sensitive_noted',
    payload: { proposalID: 'proposal-a' },
  });

  expect(parseSensitiveRecord(record)).toStrictEqual({
    target: 'proposal',
    proposalID: 'proposal-a',
  });
});

test('it refuses an item mark with no flag', () => {
  const record = buildMockLogRecord({
    kind: 'memory.sensitive_marked',
    payload: { itemID: 'item-a' },
  });

  expect(() => parseSensitiveRecord(record)).toThrow();
});

test('it reads a record of another kind as null', () => {
  const record = buildMockLogRecord({ kind: 'memory.pinned', payload: { itemID: 'item-a' } });

  expect(parseSensitiveRecord(record)).toBeNull();
});
