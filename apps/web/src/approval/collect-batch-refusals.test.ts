import { expect, test } from 'bun:test';
import { collectBatchRefusals } from './collect-batch-refusals';
import type { SeenApproval } from './merge-seen-approvals';

function setupTest() {
  return {
    buildEntry: (proposalID: string, sentence: string): SeenApproval => ({
      proposalID,
      group: 'routine',
      firstActionHash: 'hash',
      item: {
        proposal: {
          proposalID,
          shortID: proposalID,
          kind: 'action',
          riskClass: 'routine',
          actionHash: 'hash',
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
        body: { sentence, fields: {}, ruleSentence: null, approveLabel: 'Run' },
        task: null,
        choices: ['approve'],
        answeredOn: null,
        isAnsweredHere: false,
      },
    }),
  };
}

test('it gives each refused answer its own line and leaves the approved ones out', () => {
  const ctx = setupTest();

  const lines = collectBatchRefusals(
    [
      { proposalID: 'a', state: 'approved' },
      {
        proposalID: 'b',
        error: 'CONFLICT',
        current: { actionHash: 'new', ruleHash: null },
      },
      { proposalID: 'c', error: 'CLOSED', state: 'approved' },
    ],
    [
      ctx.buildEntry('a', 'Send A.'),
      ctx.buildEntry('b', 'Send B.'),
      ctx.buildEntry('c', 'Send C.'),
    ],
  );

  expect(lines).toStrictEqual([
    'Send B. changed after you opened it, so open it and check it.',
    'Send C. was answered, withdrawn or lapsed already.',
  ]);
});
