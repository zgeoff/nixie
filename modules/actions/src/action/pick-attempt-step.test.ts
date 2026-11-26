import { expect, test } from 'bun:test';
import type { AttemptVerdict } from './attempt-check';
import { pickAttemptStep } from './pick-attempt-step';

test('it goes ahead on an allow verdict', () => {
  expect(
    pickAttemptStep(
      { kind: 'go', destinations: ['team'] },
      { is_approved: 0, risk_class: 'routine' },
    ),
  ).toStrictEqual({ kind: 'go', destinations: ['team'], replyTargets: [] });
});

test('it denies on a deny verdict', () => {
  const verdict: AttemptVerdict = { kind: 'deny', rule: null, message: 'no' };

  expect(pickAttemptStep(verdict, { is_approved: 1, risk_class: 'routine' })).toStrictEqual({
    kind: 'deny',
    verdict,
  });
});

test('it holds an action that a rule allowed when it now asks', () => {
  const verdict: AttemptVerdict = {
    kind: 'ask',
    cause: 'ask_rule',
    destinations: ['team'],
    proposalID: 'proposal-1',
    record: { kind: 'recovery.started', definitions: { snapshotHash: 'sha256:x' } },
  };

  expect(pickAttemptStep(verdict, { is_approved: 0, risk_class: 'routine' })).toStrictEqual({
    kind: 'hold',
    verdict,
  });
});

test('it holds an approved routine action that now falls in the always-ask set', () => {
  const verdict: AttemptVerdict = {
    kind: 'ask',
    cause: 'always_ask',
    destinations: ['team'],
    proposalID: 'proposal-1',
    record: { kind: 'recovery.started', definitions: { snapshotHash: 'sha256:x' } },
  };

  expect(pickAttemptStep(verdict, { is_approved: 1, risk_class: 'routine' })).toStrictEqual({
    kind: 'hold',
    verdict,
  });
});

test('it goes ahead with an approved routine action that a rule only asks about', () => {
  const verdict: AttemptVerdict = {
    kind: 'ask',
    cause: 'ask_rule',
    destinations: ['team'],
    proposalID: 'proposal-1',
    record: { kind: 'recovery.started', definitions: { snapshotHash: 'sha256:x' } },
  };

  expect(pickAttemptStep(verdict, { is_approved: 1, risk_class: 'routine' })).toStrictEqual({
    kind: 'go',
    destinations: ['team'],
    replyTargets: [],
  });
});

test('it goes ahead with an action approved under the always-ask class', () => {
  const verdict: AttemptVerdict = {
    kind: 'ask',
    cause: 'always_ask',
    destinations: ['team'],
    proposalID: 'proposal-1',
    record: { kind: 'recovery.started', definitions: { snapshotHash: 'sha256:x' } },
  };

  expect(pickAttemptStep(verdict, { is_approved: 1, risk_class: 'always_ask' })).toStrictEqual({
    kind: 'go',
    destinations: ['team'],
    replyTargets: [],
  });
});

test('it keeps the reply targets of an approved action that goes ahead', () => {
  const verdict: AttemptVerdict = {
    kind: 'ask',
    cause: 'ask_rule',
    destinations: ['sam@example.org', 'kim@example.org'],
    replyTargets: ['sam@example.org'],
    proposalID: 'proposal-1',
    record: { kind: 'recovery.started', definitions: { snapshotHash: 'sha256:x' } },
  };

  expect(pickAttemptStep(verdict, { is_approved: 1, risk_class: 'routine' })).toStrictEqual({
    kind: 'go',
    destinations: ['sam@example.org', 'kim@example.org'],
    replyTargets: ['sam@example.org'],
  });
});
