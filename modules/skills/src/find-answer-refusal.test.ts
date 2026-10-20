import { expect, test } from 'bun:test';
import { findAnswerRefusal } from './find-answer-refusal';

test('it finds no refusal for an open proposal over the version in force', () => {
  expect(
    findAnswerRefusal({
      answer: { answer: 'approve', proposalID: 'k3vq8m2xpa', skillHash: 'hash-b' },
      state: {
        proposal: {
          proposalID: 'k3vq8m2xpa',
          name: 'tide-tables',
          skillHash: 'hash-b',
          baseHash: 'hash-a',
          files: [{ path: 'SKILL.md', text: '# Tides\n' }],
          untypedToken: null,
          provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
        },
        thread: 'conversation',
        proposedAt: 1000,
        outcome: null,
      },
      now: 2000,
      currentHash: 'hash-a',
    }),
  ).toBeNull();
});

test('it refuses an answer to a proposal no record holds', () => {
  expect(
    findAnswerRefusal({
      answer: { answer: 'approve', proposalID: 'k3vq8m2xpa', skillHash: 'hash-b' },
      state: undefined,
      now: 2000,
      currentHash: null,
    }),
  ).toMatchObject({ code: 'NOT_FOUND' });
});

test('it refuses an answer to a proposal an answer closed', () => {
  expect(
    findAnswerRefusal({
      answer: { answer: 'reject', proposalID: 'k3vq8m2xpa', skillHash: 'hash-b', reason: 'no' },
      state: {
        proposal: {
          proposalID: 'k3vq8m2xpa',
          name: 'tide-tables',
          skillHash: 'hash-b',
          baseHash: 'hash-a',
          files: [{ path: 'SKILL.md', text: '# Tides\n' }],
          untypedToken: null,
          provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
        },
        thread: 'conversation',
        proposedAt: 1000,
        outcome: 'approved',
      },
      now: 2000,
      currentHash: 'hash-a',
    }),
  ).toMatchObject({ code: 'PROPOSAL_CLOSED', outcome: 'approved' });
});

test('it refuses an answer to a proposal past its lapse time, before the sweep records the lapse', () => {
  expect(
    findAnswerRefusal({
      answer: { answer: 'approve', proposalID: 'k3vq8m2xpa', skillHash: 'hash-b' },
      state: {
        proposal: {
          proposalID: 'k3vq8m2xpa',
          name: 'tide-tables',
          skillHash: 'hash-b',
          baseHash: 'hash-a',
          files: [{ path: 'SKILL.md', text: '# Tides\n' }],
          untypedToken: null,
          provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
        },
        thread: 'conversation',
        proposedAt: 1000,
        outcome: null,
      },
      now: 1000 + 14 * 24 * 60 * 60 * 1000,
      currentHash: 'hash-a',
    }),
  ).toMatchObject({ code: 'PROPOSAL_CLOSED', outcome: 'lapsed' });
});

test('it refuses an answer under another skill hash', () => {
  expect(
    findAnswerRefusal({
      answer: { answer: 'approve', proposalID: 'k3vq8m2xpa', skillHash: 'hash-c' },
      state: {
        proposal: {
          proposalID: 'k3vq8m2xpa',
          name: 'tide-tables',
          skillHash: 'hash-b',
          baseHash: 'hash-a',
          files: [{ path: 'SKILL.md', text: '# Tides\n' }],
          untypedToken: null,
          provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
        },
        thread: 'conversation',
        proposedAt: 1000,
        outcome: null,
      },
      now: 2000,
      currentHash: 'hash-a',
    }),
  ).toMatchObject({ code: 'PROPOSAL_HASH' });
});

test('it refuses an answer to a proposal whose base is no longer in force as stale', () => {
  expect(
    findAnswerRefusal({
      answer: { answer: 'approve', proposalID: 'k3vq8m2xpa', skillHash: 'hash-b' },
      state: {
        proposal: {
          proposalID: 'k3vq8m2xpa',
          name: 'tide-tables',
          skillHash: 'hash-b',
          baseHash: 'hash-a',
          files: [{ path: 'SKILL.md', text: '# Tides\n' }],
          untypedToken: null,
          provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
        },
        thread: 'conversation',
        proposedAt: 1000,
        outcome: null,
      },
      now: 2000,
      currentHash: 'hash-d',
    }),
  ).toMatchObject({ code: 'STALE_BASE' });
});
