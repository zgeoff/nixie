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

test('it reads a subject change of an item as the version that moved it, and the subjects it moved from and to', () => {
  const record = buildMockLogRecord({
    kind: 'memory.subject_changed',
    payload: { itemID: 'item-a', version: 3, subject: 'owner', previousSubject: 'self' },
  });

  expect(parseSubjectRecord(record)).toStrictEqual({
    target: 'item_change',
    itemID: 'item-a',
    version: 3,
    subject: 'owner',
    previousSubject: 'self',
  });
});

test('it reads the subject change a proposal holds as the subject it moves its item to', () => {
  const record = buildMockLogRecord({
    kind: 'memory.proposal_subject_changed',
    payload: { proposalID: 'proposal-a', subject: 'shared' },
  });

  expect(parseSubjectRecord(record)).toStrictEqual({
    target: 'proposal_change',
    proposalID: 'proposal-a',
    subject: 'shared',
  });
});

test('it refuses a subject change that names no subject', () => {
  const record = buildMockLogRecord({
    kind: 'memory.subject_changed',
    payload: { itemID: 'item-a', version: 3, subject: 'team', previousSubject: 'self' },
  });

  expect(() => parseSubjectRecord(record)).toThrow();
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
