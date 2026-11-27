import { expect, test } from 'bun:test';
import type { PolicyDecision } from '@heynixie/policy';
import { isMemoryRuleAsk } from './build-memory-verdict';

test('it takes an ask rule on a memory write as a memory proposal', () => {
  const policy = {
    sentence: null,
    memoryWrite: { allowing: [] },
    decision: {
      outcome: 'ask',
      stage: 6,
      rule: { id: 'ask-memory', revision: 1, others: [] },
      cause: 'ask_rule',
      destinations: [],
      snapshot: 'snapshot-1',
    },
  } satisfies PolicyDecision;

  expect(isMemoryRuleAsk(policy)).toBe(true);
});

test('it sends an ask rule on a memory write to the action card when another rule errored', () => {
  const policy = {
    sentence: null,
    memoryWrite: { allowing: [] },
    decision: {
      outcome: 'ask',
      stage: 6,
      rule: { id: 'ask-memory', revision: 1, others: [] },
      cause: 'ask_rule',
      destinations: [],
      snapshot: 'snapshot-1',
      conditionErrors: [
        {
          ruleID: 'allow-notes',
          outcome: 'allow',
          revision: 2,
          code: 'no_such_key',
          missing: 'count',
        },
      ],
    },
  } satisfies PolicyDecision;

  expect(isMemoryRuleAsk(policy)).toBe(false);
});
