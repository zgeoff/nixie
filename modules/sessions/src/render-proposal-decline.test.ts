import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderProposalDecline } from './render-proposal-decline';

test('it tells the task a skill proposal was declined, with the note', () => {
  const record = buildMockLogRecord({
    sequence: 61,
    kind: 'skills.write_rejected',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: { proposalID: 'k3vq8m2xpa' },
    erasable: { status: 'readable', fields: { reason: 'Too broad.' } },
  });

  expect(
    renderProposalDecline(record, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T03:12:00Z'),
    }),
  ).toContain('Declined the skill proposal `k3vq8m2xpa`. Too broad.');
});

test('it tells the task a memory proposal was declined, under a short ID and with no note after a forget', () => {
  const record = buildMockLogRecord({
    sequence: 62,
    kind: 'memory.proposal_rejected',
    thread: 'conversation',
    recordedAt: new Date('2026-10-13T03:05:00Z'),
    payload: { proposalID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60' },
    erasable: { status: 'shredded' },
  });

  const rendered = renderProposalDecline(record, {
    defaultZone: 'Australia/Sydney',
    now: new Date('2026-10-13T03:12:00Z'),
  });

  expect(rendered).toContain('Declined the memory proposal `');
  expect(rendered).not.toContain('0b9d8f0e-6f1c');
});
