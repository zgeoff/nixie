import { expect, test } from 'bun:test';
import { buildMockSharedProposal } from '@heynixie/proposals/test-utils';
import { collectOrderedRows, pickApprovalGroup } from './collect-ordered-rows';

test('#collectOrderedRows puts the groups in digest order, lifting rows first among the always-ask ones', () => {
  const rows = [
    {
      id: 'deferred',
      proposal: buildMockSharedProposal({ state: 'deferred', createdSequence: 1 }),
    },
    {
      id: 'memory',
      proposal: buildMockSharedProposal({ kind: 'memory_write', createdSequence: 2 }),
    },
    { id: 'routine', proposal: buildMockSharedProposal({ createdSequence: 3 }) },
    {
      id: 'always-ask',
      proposal: buildMockSharedProposal({ riskClass: 'always_ask', createdSequence: 4 }),
    },
    {
      id: 'lifting',
      proposal: buildMockSharedProposal({ riskClass: 'lifting', createdSequence: 5 }),
    },
  ].map((row) => ({
    id: row.id,
    proposal: row.proposal,
    group: pickApprovalGroup(row.proposal),
    taskName: null,
  }));

  expect(collectOrderedRows(rows).map((row) => row.id)).toStrictEqual([
    'lifting',
    'always-ask',
    'routine',
    'memory',
    'deferred',
  ]);
});

test('#collectOrderedRows sorts the routine rows by task, oldest first within each task', () => {
  const rows = [
    { id: 'reports-new', taskName: 'Reports', createdSequence: 9 },
    { id: 'chores-old', taskName: 'Chores', createdSequence: 4 },
    { id: 'reports-old', taskName: 'Reports', createdSequence: 2 },
    { id: 'chores-new', taskName: 'Chores', createdSequence: 6 },
  ].map((row) => ({
    id: row.id,
    taskName: row.taskName,
    group: 'routine' as const,
    proposal: buildMockSharedProposal({ createdSequence: row.createdSequence }),
  }));

  expect(collectOrderedRows(rows).map((row) => row.id)).toStrictEqual([
    'chores-old',
    'chores-new',
    'reports-old',
    'reports-new',
  ]);
});

test('#pickApprovalGroup puts a deferred always-ask row in the deferred group', () => {
  const row = buildMockSharedProposal({ riskClass: 'always_ask', state: 'deferred' });

  expect(pickApprovalGroup(row)).toBe('deferred');
});
