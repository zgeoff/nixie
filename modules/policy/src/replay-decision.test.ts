import { expect, test } from 'bun:test';
import { replayDecision } from './replay-decision';
import { buildPolicyCall } from './test-utils/build-policy-call';
import { buildRuleEntry } from './test-utils/build-rule-entry';
import {
  buildTestDecisionPoint,
  buildTestDeclaration,
  buildTypedMessage,
} from './test-utils/build-test-decision-point';
import { toStoredDecision } from './to-stored-decision';

test.each([
  ['1', { declaration: null }, {}],
  ['2', {}, { toolList: ['other'] }],
  ['3', { rules: [buildRuleEntry('deny-sends', { outcome: 'deny', effects: ['send'] })] }, {}],
  ['4', { declaration: buildTestDeclaration({ effects: ['spend'], destinations: [] }) }, {}],
  ['5', {}, { destinations: [{ value: 'sam@example.org', replyTarget: false }] }],
  ['6', { rules: [buildRuleEntry('ask-sends', { outcome: 'ask', effects: ['send'] })] }, {}],
  ['7', { rules: [buildRuleEntry('allow-sends', { outcome: 'allow', effects: ['send'] })] }, {}],
  [
    '8',
    {
      declaration: buildTestDeclaration({ effects: ['write'], destinations: [] }),
      messages: [buildTypedMessage(7, 'Tidy my notes', 1_794_550_000_000)],
    },
    { turnMessageSequence: 7 },
  ],
  ['9', { declaration: buildTestDeclaration({ effects: ['write'], destinations: [] }) }, {}],
] as const)(
  'it replays the decision of stage %s from its record to the same decision',
  async (_stage, setup, call) => {
    const ctx = buildTestDecisionPoint(setup);
    const policyCall = buildPolicyCall(call);

    const original = await ctx.decide(policyCall);

    const replayed = await replayDecision(ctx.replay, {
      tool: policyCall.tool,
      input: {},
      destinations: policyCall.destinations,
      decision: toStoredDecision(original.decision, policyCall),
      snapshot: policyCall.snapshot,
      at: policyCall.at,
    });

    expect(replayed).toStrictEqual(original);
  },
);

test('it takes the consent answer from the record, never from a new checker call', async () => {
  const ctx = buildTestDecisionPoint({
    declaration: buildTestDeclaration({ effects: ['write'], destinations: [] }),
    messages: [buildTypedMessage(7, 'Tidy my notes', 1_794_550_000_000)],
  });

  const policyCall = buildPolicyCall({ turnMessageSequence: 7 });

  const original = await ctx.decide(policyCall);

  const asked = ctx.asked.length;

  await replayDecision(ctx.replay, {
    tool: policyCall.tool,
    input: {},
    destinations: [],
    decision: toStoredDecision(original.decision, policyCall),
    snapshot: policyCall.snapshot,
    at: policyCall.at,
  });

  expect(ctx.asked).toHaveLength(asked);
});

test('it has no replay for a record from before the full decision point', async () => {
  const ctx = buildTestDecisionPoint();

  const replayed = await replayDecision(ctx.replay, {
    tool: 'mail.send',
    input: {},
    destinations: [],
    decision: { outcome: 'allow', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
    snapshot: 'snapshot-1',
    at: 1,
  });

  expect(replayed).toBeNull();
});
