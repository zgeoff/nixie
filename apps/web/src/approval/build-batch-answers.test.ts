import { expect, test } from 'bun:test';
import { buildBatchAnswers, isBatchable } from './build-batch-answers';
import type { SeenApproval } from './merge-seen-approvals';

function setupTest() {
  return {
    buildEntry: (
      proposalID: string,
      overrides: {
        group?: SeenApproval['group'];
        kind?: 'action' | 'memory_write' | 'internal_change';
        riskClass?: 'routine' | 'always_ask' | 'lifting';
        state?: 'pending' | 'deferred';
      } = {},
    ): SeenApproval => ({
      proposalID,
      group: overrides.group ?? 'routine',
      item: {
        proposal: {
          proposalID,
          shortID: proposalID,
          kind: overrides.kind ?? 'action',
          riskClass: overrides.riskClass ?? 'routine',
          actionHash: `now-${proposalID}`,
          ruleHash: null,
          cause: 'no_rule',
          state: overrides.state ?? 'pending',
          createdAt: new Date('2026-11-15T01:00:00Z'),
          lapsesAt: new Date('2026-11-18T01:00:00Z'),
          deadlineAt: null,
          deferGeneration: 0,
          deferUntil: null,
          thread: 'conversation',
          taskID: null,
          sequence: 1,
        },
        body: { sentence: 'Run it.', fields: {}, ruleSentence: null, approveLabel: 'Run it' },
        task: null,
        choices: ['approve'],
        passkeyChoices: [],
        answeredOn: null,
        isAnsweredHere: false,
        call: null,
      },
    }),
  };
}

test('it asks for one approve per routine row against the hash its line shows', () => {
  const ctx = setupTest();
  let count = 0;

  const calls = buildBatchAnswers(
    [ctx.buildEntry('a'), ctx.buildEntry('b')],
    () => `action-${String((count += 1))}`,
  );

  expect(calls).toStrictEqual([
    [
      { proposalID: 'a', actionHash: 'now-a', choice: 'approve', clientActionID: 'action-1' },
      { proposalID: 'b', actionHash: 'now-b', choice: 'approve', clientActionID: 'action-2' },
    ],
  ]);
});

test.each([
  ['an always-ask row', { group: 'always_ask' as const, riskClass: 'always_ask' as const }],
  ['a lifting row', { group: 'always_ask' as const, riskClass: 'lifting' as const }],
  ['a memory row', { group: 'memory' as const, kind: 'memory_write' as const }],
  ['a deferred row', { group: 'deferred' as const, state: 'deferred' as const }],
])('it leaves %s out of a batch', (_name, overrides) => {
  const ctx = setupTest();

  expect(isBatchable(ctx.buildEntry('a', overrides))).toBeFalse();
});

test('it splits more than 100 rows into calls of at most 100', () => {
  const ctx = setupTest();

  const entries = Array.from({ length: 101 }, (_unused, index) =>
    ctx.buildEntry(`row-${String(index)}`),
  );

  const calls = buildBatchAnswers(entries, () => crypto.randomUUID());

  expect(calls.map((call) => call.length)).toStrictEqual([100, 1]);
});

test('it builds no call when no row is batchable', () => {
  const ctx = setupTest();

  expect(
    buildBatchAnswers([ctx.buildEntry('a', { group: 'memory', kind: 'memory_write' })], () => 'x'),
  ).toStrictEqual([]);
});
