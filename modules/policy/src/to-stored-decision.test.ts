import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildPolicyCall } from './test-utils/build-policy-call';
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
