import { expect, test } from 'bun:test';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '../test-utils/render';
import type { ApprovalRead } from '../types';
import { ApprovalControls } from './approval-controls';
import type { ApprovalAnswerer } from './use-approval-answer';

type Body = NonNullable<ApprovalRead['body']>;

function setupTest() {
  const sent: Parameters<ApprovalAnswerer['send']>[0][] = [];

  const answerer: ApprovalAnswerer = {
    send: (input) => {
      sent.push(input);
    },
    isPending: false,
    isFailed: false,
  };

  return {
    sent,
    show: (body: Partial<Body>) => {
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
          sentence: 'Fetch a page.',
          fields: {},
          ruleSentence: null,
          approveLabel: 'Approve',
          ...body,
        },
        task: null,
        choices: ['approve', 'defer', 'decline'],
        passkeyChoices: [],
        answeredOn: null,
        isAnsweredHere: false,
        call: null,
      };

      return render(
        <ApprovalControls
          answerer={answerer}
          defer={{ defaultMinutes: 60, eveningAt: '18:00', morningAt: '08:00', zone: 'UTC' }}
          editedText={null}
          isApprovable
          isEditable={false}
          isEditing={false}
          isRuleProposal={false}
          item={item}
          onEditToggle={() => {}}
        />,
      );
    },
  };
}

test('it offers to trust the place to read and to act, with each level its own hash', () => {
  const ctx = setupTest();

  ctx.show({ place: { words: 'tickets.example.com', readHash: 'hash-read', actHash: 'hash-act' } });
  fireEvent.click(screen.getByRole('button', { name: 'Trust this place to read' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trust this place to act' }));

  expect(ctx.sent).toStrictEqual([
    {
      proposalID: 'proposal-1',
      actionHash: 'sha256:action',
      choice: 'approve',
      trust: 'read',
      placeHash: 'hash-read',
    },
    {
      proposalID: 'proposal-1',
      actionHash: 'sha256:action',
      choice: 'approve',
      trust: 'act',
      placeHash: 'hash-act',
    },
  ]);
});

test('it shows the place that the trust answers grant, beside the buttons', () => {
  const ctx = setupTest();

  ctx.show({ place: { words: 'example.org', readHash: 'hash-read', actHash: 'hash-act' } });

  expect(screen.getByText('The place these answers trust: example.org')).toBeDefined();
});

test('it offers no trust answer for a card that names no place', () => {
  const ctx = setupTest();

  ctx.show({});

  expect(screen.queryByRole('button', { name: 'Trust this place to read' })).toBeNull();
});

test('it approves a proposal with every place ticked and sends no ticks', () => {
  const ctx = setupTest();

  ctx.show({
    places: [
      { words: 'tickets.example.com', trust: 'act', why: 'You book here.' },
      { words: 'library.example.org and every subdomain', trust: 'read', why: 'Its catalog.' },
    ],
  });

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  expect(ctx.sent).toStrictEqual([
    { proposalID: 'proposal-1', actionHash: 'sha256:action', choice: 'approve' },
  ]);
});

test('it sends the places that stay ticked when you untick one', () => {
  const ctx = setupTest();

  ctx.show({
    places: [
      { words: 'tickets.example.com', trust: 'act', why: 'You book here.' },
      { words: 'library.example.org and every subdomain', trust: 'read', why: 'Its catalog.' },
    ],
  });

  fireEvent.click(screen.getByRole('checkbox', { name: /tickets\.example\.com/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  expect(ctx.sent).toStrictEqual([
    {
      proposalID: 'proposal-1',
      actionHash: 'sha256:action',
      choice: 'approve',
      tickedPlaces: [1],
    },
  ]);
});
