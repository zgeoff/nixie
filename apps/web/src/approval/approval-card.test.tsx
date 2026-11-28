import { expect, test } from 'bun:test';
import { screen, within } from '@testing-library/react';
import { render } from '../test-utils/render';
import type { ApprovalRead } from '../types';
import { ApprovalCard } from './approval-card';

function setupTest() {
  return {
    show: (overrides: Partial<ApprovalRead>) => {
      const item: ApprovalRead = {
        proposal: {
          proposalID: 'proposal-1',
          shortID: 'k3p9m2x7qa',
          kind: 'action',
          riskClass: 'routine',
          actionHash: 'sha256:action',
          ruleHash: null,
          cause: 'outside_steering',
          state: 'pending',
          createdAt: new Date('2026-11-28T00:00:00Z'),
          lapsesAt: new Date('2026-12-01T00:00:00Z'),
          deadlineAt: null,
          deferGeneration: 0,
          deferUntil: null,
          thread: 'conversation',
          taskID: null,
          sequence: 1,
        },
        body: {
          sentence: 'Send a mail to the harbour office.',
          fields: {},
          ruleSentence: null,
          approveLabel: 'Approve',
        },
        task: null,
        chain: [],
        choices: ['approve', 'defer', 'decline'],
        passkeyChoices: [],
        answeredOn: null,
        isAnsweredHere: false,
        call: null,
        ...overrides,
      };

      return render(
        <ApprovalCard
          defer={{ defaultMinutes: 60, eveningAt: '18:00', morningAt: '08:00', zone: 'UTC' }}
          item={item}
          onRefresh={() => {}}
        />,
      );
    },
  };
}

test('it lists each step from the starting message to the asking task by its short ID and name', () => {
  const ctx = setupTest();

  ctx.show({
    task: { id: 'k7m2x9q3pa', name: 'Check the sender' },
    chain: [
      { kind: 'message', id: 'conversation', name: 'Conversation' },
      { kind: 'task', id: 'p4k8v2m6xa', name: 'Read the inbox' },
      { kind: 'coding', id: 'cs4k7m2xq9', name: 'Fix the parser' },
      { kind: 'task', id: 'k7m2x9q3pa', name: 'Check the sender' },
    ],
  });

  const steps = within(screen.getByRole('list', { name: 'How this came about' }))
    .getAllByRole('listitem')
    .map((step) => step.textContent);

  expect(steps).toStrictEqual([
    'Message conversation: Conversation',
    'Task p4k8v2m6xa: Read the inbox',
    'Coding session cs4k7m2xq9: Fix the parser',
    'Task k7m2x9q3pa: Check the sender',
  ]);
});

test('it lists no chain for a card that one thread asked', () => {
  const ctx = setupTest();

  ctx.show({ chain: [{ kind: 'message', id: 'conversation', name: 'Conversation' }] });

  expect(screen.queryByRole('list', { name: 'How this came about' })).toBeNull();
});
