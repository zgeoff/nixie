import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { parseKindRecord } from './parse-kind-record';

test('it reads the self-note mark of an item', () => {
  const record = buildMockLogRecord({ kind: 'memory.self_noted', payload: { itemID: 'item-a' } });

  expect(parseKindRecord(record)).toStrictEqual({ kind: 'memory.self_noted', itemID: 'item-a' });
});

test('it reads the self-note mark of a proposal', () => {
  const record = buildMockLogRecord({
    kind: 'memory.proposal_self_noted',
    payload: { proposalID: 'proposal-a' },
  });

  expect(parseKindRecord(record)).toStrictEqual({
    kind: 'memory.proposal_self_noted',
    proposalID: 'proposal-a',
  });
});

test('it refuses a self-note mark with a key its shape does not hold', () => {
  const record = buildMockLogRecord({
    kind: 'memory.self_noted',
    payload: { itemID: 'item-a', itemKind: 'self' },
  });

  expect(() => parseKindRecord(record)).toThrow();
});

test('it reads a record of another kind as null', () => {
  const record = buildMockLogRecord({ kind: 'memory.pinned', payload: { itemID: 'item-a' } });

  expect(parseKindRecord(record)).toBeNull();
});
