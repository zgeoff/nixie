import { expect, test } from 'bun:test';
import type { ApprovalItem } from '../types';
import { applyApprovalReads, mergeSeenApprovals, toApprovalRead } from './merge-seen-approvals';

function setupTest() {
  return {
    buildListed: (proposalID: string, actionHash: string, group: ApprovalItem['group']) => {
      const item: ApprovalItem = {
        group,
        proposal: {
          proposalID,
          shortID: proposalID,
          kind: 'action',
          riskClass: 'routine',
          actionHash,
          ruleHash: null,
          cause: 'no_rule',
          state: 'pending',
          createdAt: new Date('2026-11-15T01:00:00Z'),
          lapsesAt: new Date('2026-11-18T01:00:00Z'),
          deadlineAt: null,
          deferGeneration: 0,
          deferUntil: null,
          thread: 'conversation',
          taskID: null,
          sequence: 1,
        },
        body: {
          sentence: `Run ${proposalID}.`,
          fields: {},
          ruleSentence: null,
          approveLabel: 'Run',
        },
        task: null,
        chain: [],
        choices: ['approve', 'defer', 'decline'],
        passkeyChoices: [],
      };

      return item;
    },
  };
}

test('it lists the current rows in their listed order', () => {
  const ctx = setupTest();

  const merged = mergeSeenApprovals(
    [],
    [ctx.buildListed('b', 'hash-b', 'routine'), ctx.buildListed('a', 'hash-a', 'always_ask')],
  );

  expect(merged.map((entry) => [entry.proposalID, entry.group])).toStrictEqual([
    ['b', 'routine'],
    ['a', 'always_ask'],
  ]);
});

test('it keeps a row that left the list after the current rows', () => {
  const ctx = setupTest();

  const first = mergeSeenApprovals(
    [],
    [ctx.buildListed('a', 'hash-a', 'routine'), ctx.buildListed('b', 'hash-b', 'routine')],
  );

  const merged = mergeSeenApprovals(first, [ctx.buildListed('b', 'hash-b', 'routine')]);

  expect(merged.map((entry) => entry.proposalID)).toStrictEqual(['b', 'a']);
});

test('it takes the action hash the list now holds for a row', () => {
  const ctx = setupTest();
  const first = mergeSeenApprovals([], [ctx.buildListed('a', 'hash-old', 'routine')]);
  const merged = mergeSeenApprovals(first, [ctx.buildListed('a', 'hash-new', 'routine')]);

  expect(merged.map((entry) => entry.item.proposal.actionHash)).toStrictEqual(['hash-new']);
});

test('it moves a row to the group the list now holds it in', () => {
  const ctx = setupTest();
  const first = mergeSeenApprovals([], [ctx.buildListed('a', 'hash-a', 'routine')]);
  const merged = mergeSeenApprovals(first, [ctx.buildListed('a', 'hash-a', 'deferred')]);

  expect(merged.map((entry) => entry.group)).toStrictEqual(['deferred']);
});

test('it takes the read of a row that left the list as its entry', () => {
  const ctx = setupTest();
  const first = mergeSeenApprovals([], [ctx.buildListed('a', 'hash-a', 'routine')]);

  const read = {
    ...toApprovalRead(ctx.buildListed('a', 'hash-a', 'routine')),
    answeredOn: 'kitchen tablet',
  };

  const applied = applyApprovalReads(first, [read]);

  expect(applied.map((entry) => entry.item.answeredOn)).toStrictEqual(['kitchen tablet']);
});

test('it keeps the body a row showed when the read of its closed row has none', () => {
  const ctx = setupTest();
  const first = mergeSeenApprovals([], [ctx.buildListed('a', 'hash-a', 'routine')]);
  const read = { ...toApprovalRead(ctx.buildListed('a', 'hash-a', 'routine')), body: null };
  const applied = applyApprovalReads(first, [read]);

  expect(applied.map((entry) => entry.item.body?.sentence)).toStrictEqual(['Run a.']);
});
