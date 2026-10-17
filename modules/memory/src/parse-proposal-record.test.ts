import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { parseProposalRecord } from './parse-proposal-record';

test('it keeps a review reason this release does not know word for word', () => {
  const record = buildMockLogRecord({
    kind: 'memory.proposed',
    payload: {
      proposalID: 'proposal-a',
      itemID: 'item-a',
      isNewItem: true,
      operation: 'remember',
      targetVersion: null,
      isPinned: false,
      reviewReason: 'self_note',
      actionHash: 'hash-a',
      sealed: 'c2VhbGVk',
      evidence: null,
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      capGroup: 'turn-1',
      checks: null,
      model: 'claude-opus-5-5',
      noticeKey: null,
      lapseAt: 1_800_000_000_000,
    },
  });

  expect(parseProposalRecord(record)).toMatchObject({
    kind: 'memory.proposed',
    reviewReason: 'self_note',
  });
});

test('it refuses a proposal record whose review reason is not text', () => {
  const record = buildMockLogRecord({
    kind: 'memory.proposed',
    payload: {
      proposalID: 'proposal-a',
      itemID: 'item-a',
      isNewItem: true,
      operation: 'remember',
      targetVersion: null,
      isPinned: false,
      reviewReason: 7,
      actionHash: 'hash-a',
      sealed: 'c2VhbGVk',
      evidence: null,
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      capGroup: 'turn-1',
      checks: null,
      model: 'claude-opus-5-5',
      noticeKey: null,
      lapseAt: 1_800_000_000_000,
    },
  });

  expect(() => parseProposalRecord(record)).toThrow();
});
