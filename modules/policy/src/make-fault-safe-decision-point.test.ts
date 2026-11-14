import { expect, test } from 'bun:test';
import { makeFaultSafeDecisionPoint } from './make-fault-safe-decision-point';
import { buildPolicyCall } from './test-utils/build-policy-call';

test('it denies with the fault threw and the running stage when the decision point throws', async () => {
  const decide = makeFaultSafeDecisionPoint((_call, progress) => {
    if (progress !== undefined) {
      progress.stage = 5;
    }

    return Promise.reject(new Error('the rules could not be read'));
  });

  const decided = await decide(buildPolicyCall());

  expect(decided).toStrictEqual({
    decision: {
      outcome: 'deny',
      stage: 5,
      rule: null,
      destinations: [],
      snapshot: 'snapshot-1',
      fault: 'threw',
    },
    sentence: 'Not allowed: nixie could not decide on this call. Try again later.',
  });
});

test('it denies with the fault timed_out and the running stage when the decision point runs past the deadline', async () => {
  const decide = makeFaultSafeDecisionPoint(
    (_call, progress) => {
      if (progress !== undefined) {
        progress.stage = 8;
      }

      return Promise.withResolvers<never>().promise;
    },
    { deadlineMs: 10 },
  );

  const decided = await decide(buildPolicyCall());

  expect(decided.decision).toStrictEqual({
    outcome: 'deny',
    stage: 8,
    rule: null,
    destinations: [],
    snapshot: 'snapshot-1',
    fault: 'timed_out',
  });
});

test('it returns the decision of a decision point that answers in time', async () => {
  const decide = makeFaultSafeDecisionPoint((call) =>
    Promise.resolve({
      decision: {
        outcome: 'allow',
        stage: 7,
        rule: null,
        destinations: [],
        snapshot: call.snapshot,
      },
      sentence: null,
    }),
  );

  const decided = await decide(buildPolicyCall());

  expect(decided.decision.outcome).toBe('allow');
});
