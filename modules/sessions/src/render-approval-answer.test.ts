import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderApprovalAnswer } from './render-approval-answer';

test('it tells the model an approval ran nothing, under the ID it knows the proposal by', () => {
  const record = buildMockLogRecord({
    sequence: 51,
    kind: 'policy.action_answered',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: { proposalID: 'a-uuid', shortID: 'k3vq8m2xpa', answer: 'approved' },
  });

  expect(
    renderApprovalAnswer(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T03:12:00Z'),
    }),
  ).toContain(
    'Approved `k3vq8m2xpa`. nixie runs approved actions in a later release, so this one did not run.',
  );
});

test('it gives the reason of a decline', () => {
  const record = buildMockLogRecord({
    sequence: 52,
    kind: 'policy.action_answered',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: { proposalID: 'a-uuid', shortID: 'k3vq8m2xpa', answer: 'declined' },
    erasable: { status: 'readable', fields: { reason: 'Not this week.' } },
  });

  expect(
    renderApprovalAnswer(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T03:12:00Z'),
    }),
  ).toContain('Declined `k3vq8m2xpa`. Not this week.');
});

test('it declines with no reason when a forget removed it', () => {
  const record = buildMockLogRecord({
    sequence: 53,
    kind: 'policy.action_answered',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: { proposalID: 'a-uuid', shortID: 'k3vq8m2xpa', answer: 'declined' },
    erasable: { status: 'shredded' },
  });

  expect(
    renderApprovalAnswer(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T03:12:00Z'),
    }),
  ).toInclude('[#53] Declined `k3vq8m2xpa`.\n</system-message');
});
