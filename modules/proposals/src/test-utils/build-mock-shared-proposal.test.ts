import { expect, test } from 'bun:test';
import { buildMockSharedProposal } from './build-mock-shared-proposal';

test('it builds a pending routine action proposal by default', () => {
  expect(buildMockSharedProposal()).toStrictEqual({
    id: expect.toBeString(),
    shortID: expect.toBeString(),
    family: 'action',
    kind: 'action',
    riskClass: 'routine',
    actionHash: expect.toStartWith('sha256:'),
    ruleHash: null,
    cause: 'no_rule',
    taskID: null,
    thread: 'conversation',
    createdSequence: expect.toBeNumber(),
    createdAt: expect.toBeNumber(),
    lapsesAt: expect.toBeNumber(),
    deadlineAt: null,
    state: 'pending',
    usedBy: null,
    deferGeneration: 0,
    deferUntil: null,
    returnAt: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  const built = buildMockSharedProposal({ riskClass: 'lifting', createdSequence: 7 });

  expect([built.riskClass, built.createdSequence]).toStrictEqual(['lifting', 7]);
});
