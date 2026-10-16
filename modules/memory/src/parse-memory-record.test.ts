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
    model: null,
    noticeKey: null,
    shortID: null,
    itemKind: 'fact',
  });
});

test('it reads the self-note kind of a created version record', () => {
  const record = buildMockLogRecord({
    kind: 'memory.version_added',
    payload: {
      itemID: 'item-a',
      version: 1,
      change: 'created',
      state: 'active',
      sealed: 'c2VhbGVk',
      evidence: null,
      intentEvidence: null,
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
      shortID: 'q4wz8n2kpa',
      itemKind: 'self',
    },
  });

  expect(parseMemoryRecord(record)).toMatchObject({ change: 'created', itemKind: 'self' });
});

test('it refuses a version record whose kind is neither a fact nor a self-note', () => {
  const record = buildMockLogRecord({
    kind: 'memory.version_added',
    payload: {
      itemID: 'item-a',
      version: 1,
      change: 'created',
      state: 'active',
      sealed: 'c2VhbGVk',
      evidence: null,
      intentEvidence: null,
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
      shortID: 'q4wz8n2kpa',
      itemKind: 'opinion',
    },
  });

  expect(() => parseMemoryRecord(record)).toThrow();
});

test('it reads the short ID of a created version record', () => {
  const record = buildMockLogRecord({
    kind: 'memory.version_added',
    payload: {
      itemID: 'item-a',
      version: 1,
      change: 'created',
      state: 'active',
      sealed: 'c2VhbGVk',
      evidence: null,
      intentEvidence: null,
      origin: 'owner',
      source: 'owner',
      taskID: null,
      proposalID: null,
      checks: null,
      model: null,
      noticeKey: null,
      shortID: 'k3x9m2p7qa',
    },
  });

  expect(parseMemoryRecord(record)).toMatchObject({ shortID: 'k3x9m2p7qa' });
});

test('it reads the model and the notice of a version record from the gate', () => {
  const record = buildMockLogRecord({
    kind: 'memory.version_added',
    payload: {
      itemID: 'item-a',
      version: 1,
      change: 'created',
      state: 'active',
      sealed: 'c2VhbGVk',
      evidence: { recordSequence: 3, start: 0, end: 9 },
      intentEvidence: null,
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: { quote: 'pass' },
      model: 'claude-opus-5-5',
      noticeKey: 'turn/main/3',
    },
  });

  expect(parseMemoryRecord(record)).toMatchObject({
    model: 'claude-opus-5-5',
    noticeKey: 'turn/main/3',
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
  [
    'memory.pinned',
    { itemID: 'item-a', isPinned: true },
    { kind: 'memory.pinned', itemID: 'item-a', isPinned: true },
  ],
  [
    'memory.forget_started',
    { itemID: 'item-a', version: 3 },
    { kind: 'memory.forget_started', itemID: 'item-a', version: 3, evidenceSequences: [] },
  ],
  [
    'memory.forget_started',
    { itemID: 'item-a', version: 3, evidenceSequences: [4, 9] },
    { kind: 'memory.forget_started', itemID: 'item-a', version: 3, evidenceSequences: [4, 9] },
  ],
  ['memory.forgotten', { itemID: 'item-a' }, { kind: 'memory.forgotten', itemID: 'item-a' }],
] as const)('it reads a %s record', (kind, payload, expected) => {
  const record = buildMockLogRecord({ kind, payload });

  expect(parseMemoryRecord(record)).toStrictEqual(expected);
});

test('it reads a record of another kind as null', () => {
  const record = buildMockLogRecord({ kind: 'memory.recalled', payload: { items: [] } });

  expect(parseMemoryRecord(record)).toBeNull();
});
