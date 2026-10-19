import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { parseSubjectRecord } from './parse-subject-record';

test.each([
  ['memory.self_noted', 'self'],
  ['memory.shared_noted', 'shared'],
] as const)('it reads the %s mark of an item as the %s subject', (kind, subject) => {
  const record = buildMockLogRecord({ kind, payload: { itemID: 'item-a' } });

  expect(parseSubjectRecord(record)).toStrictEqual({ target: 'item', itemID: 'item-a', subject });
});

test.each([
  ['memory.proposal_self_noted', 'self'],
  ['memory.proposal_shared_noted', 'shared'],
] as const)('it reads the %s mark of a proposal as the %s subject', (kind, subject) => {
  const record = buildMockLogRecord({ kind, payload: { proposalID: 'proposal-a' } });

  expect(parseSubjectRecord(record)).toStrictEqual({
    target: 'proposal',
    proposalID: 'proposal-a',
    subject,
  });
});

test('it refuses a subject mark with a key its shape does not hold', () => {
  const record = buildMockLogRecord({
    kind: 'memory.shared_noted',
    payload: { itemID: 'item-a', subject: 'shared' },
  });

  expect(() => parseSubjectRecord(record)).toThrow();
});

test('it reads a record of another kind as null', () => {
  const record = buildMockLogRecord({ kind: 'memory.pinned', payload: { itemID: 'item-a' } });

  expect(parseSubjectRecord(record)).toBeNull();
});
