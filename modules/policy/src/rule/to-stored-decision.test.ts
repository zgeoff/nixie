import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildPolicyCall } from '../test-utils/build-policy-call';
import { toStoredDecision } from './to-stored-decision';

test('it stores the rule without its others, the permissions in order and the inputs a replay needs', () => {
  const call = buildPolicyCall({
    toolList: ['mail.send', 'memory.recall'],
    context: 'task',
    definitionID: 'weekly',
    sources: ['own_data'],
    turnMessageSequence: null,
    onBehalfOf: [4, 9],
    destinations: [{ value: 'sam@example.org', replyTarget: false }],
  });

  const stored = toStoredDecision(
    {
      outcome: 'ask',
      stage: 5,
      rule: { id: 'ask-sends', revision: 2, others: ['ask-more'] },
      cause: 'outside_steering',
      defect: 'direct_request',
      destinations: [{ value: 'sam@example.org', permission: null }],
      consent: { messageSequences: [4], codeCheck: 'pass', checker: 'unsure' },
      snapshot: 'snapshot-1',
    },
    call,
  );

  expect(stored).toStrictEqual({
    outcome: 'ask',
    stage: 5,
    rule: { id: 'ask-sends', revision: 2 },
    ruleOthers: ['ask-more'],
    cause: 'outside_steering',
    defect: 'direct_request',
    permissions: [null],
    consentCheck: { messageSequences: [4], codeCheck: 'pass', checker: 'unsure' },
    inputs: {
      toolList: ['mail.send', 'memory.recall'],
      context: 'task',
      definitionID: 'weekly',
      sources: ['own_data'],
      turnMessageSequence: null,
      onBehalfOf: [4, 9],
    },
  });
});

test('it writes neither of the keys the first release wrote for destinations and consent', () => {
  const stored = toStoredDecision(
    {
      outcome: 'allow',
      stage: 8,
      rule: null,
      destinations: [{ value: 'sam@example.org', permission: null }],
      consent: { messageSequences: [4], codeCheck: 'pass', checker: 'yes' },
      snapshot: 'snapshot-1',
    },
    buildPolicyCall(),
  );

  expect(Object.keys(stored)).not.toIncludeAnyMembers(['destinations', 'consent']);
});

test('it stores a decision that the schema of the first release parses', () => {
  const releaseBefore = z.object({
    outcome: z.enum(['allow', 'ask', 'deny']),
    stage: z.number(),
    rule: z.object({ id: z.string(), revision: z.number() }).nullable(),
    destinations: z
      .object({ destination: z.string(), permission: z.string().nullable() })
      .array()
      .optional(),
    consent: z.object({ messageSequence: z.number(), verdict: z.string() }).optional(),
  });

  const stored = toStoredDecision(
    {
      outcome: 'ask',
      stage: 9,
      rule: null,
      cause: 'no_rule',
      destinations: [{ value: 'sam@example.org', permission: null }],
      consent: { messageSequences: [4], codeCheck: 'pass', checker: 'no' },
      snapshot: 'snapshot-1',
    },
    buildPolicyCall(),
  );

  const parsed = releaseBefore.parse(structuredClone(stored));

  expect(parsed).toStrictEqual({
    outcome: 'ask',
    stage: 9,
    rule: null,
  });
});

test('it keeps the rule, revision and code of each condition error and never the missing name', () => {
  const stored = toStoredDecision(
    {
      outcome: 'ask',
      stage: 6,
      rule: { id: 'deny-big-reads', revision: 3, others: [] },
      cause: 'condition_error',
      destinations: [],
      snapshot: 'snapshot-1',
      conditionErrors: [
        {
          ruleID: 'deny-big-reads',
          outcome: 'deny',
          revision: 3,
          code: 'no_such_key',
          missing: 'count',
        },
      ],
    },
    buildPolicyCall(),
  );

  expect(stored).toMatchObject({
    cause: 'condition_error',
    conditionErrors: [{ ruleID: 'deny-big-reads', revision: 3, code: 'no_such_key' }],
  });

  expect(JSON.stringify(stored)).not.toContain('count');
});
