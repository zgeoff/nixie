import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { parseMemoryRecord } from './parse-memory-record';

test('it reads a version record into its typed shape', () => {
  const record = buildMockLogRecord({
    kind: 'memory.version_added',
    payload: {
      itemID: 'item-a',
      version: 2,
      change: 'retired',
      state: 'retired',
      sealed: 'c2VhbGVk',
      evidence: { recordSequence: 3, start: 0, end: 9 },
      intentEvidence: null,
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: { quote: 'pass' },
    },
  });

  expect(parseMemoryRecord(record)).toStrictEqual({
    kind: 'memory.version_added',
    itemID: 'item-a',
    version: 2,
    change: 'retired',
    state: 'retired',
    sealed: 'c2VhbGVk',
    evidence: { recordSequence: 3, start: 0, end: 9 },
    intentEvidence: null,
    origin: 'conversation',
    source: 'owner',
    taskID: 'conversation',
    proposalID: null,
    checks: { quote: 'pass' },
  });
});

test('it rejects a version record whose state is not a version state', () => {
  const record = buildMockLogRecord({
    kind: 'memory.version_added',
    payload: {
      itemID: 'item-a',
      version: 2,
      change: 'retired',
      state: 'forgotten',
      sealed: 'c2VhbGVk',
      evidence: null,
      intentEvidence: null,
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  expect(() => parseMemoryRecord(record)).toThrow();
});

test.each([
  ['memory.pinned', { itemID: 'item-a', isPinned: true }],
  ['memory.forget_started', { itemID: 'item-a', version: 3 }],
  ['memory.forgotten', { itemID: 'item-a' }],
])('it reads a %s record', (kind, payload) => {
  const record = buildMockLogRecord({ kind, payload });

  expect(parseMemoryRecord(record)).toStrictEqual({ kind, ...payload });
});

test('it reads a record of another kind as null', () => {
  const record = buildMockLogRecord({ kind: 'memory.recalled', payload: { items: [] } });

  expect(parseMemoryRecord(record)).toBeNull();
});
