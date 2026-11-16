import { expect, test } from 'bun:test';
import { buildPolicyCall } from './build-policy-call';
import { readStarterDecisionPoint } from './read-starter-decision-point';

test('it asks before a sandbox task start with memory read and no persona, under the starter rule', async () => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['note'],
    destinations: [],
    amount: null,
    content: ['name', 'brief'],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({
      tool: 'task.start/sandbox',
      toolList: ['task.start'],
      args: { persona: 'none', memory: 'read' },
    }),
  );

  expect(decided.decision).toMatchObject({
    outcome: 'ask',
    cause: 'ask_rule',
    rule: { id: 'ask-stranger-with-memory' },
  });
});

test('it allows a sandbox task start that keeps the persona, under the starter rule for notes', async () => {
  const decide = readStarterDecisionPoint(() => ({
    effects: ['note'],
    destinations: [],
    amount: null,
    content: ['name', 'brief'],
    results: {},
  }));

  const decided = await decide(
    buildPolicyCall({
      tool: 'task.start/sandbox',
      toolList: ['task.start'],
      args: { persona: 'default', memory: 'read' },
    }),
  );

  expect(decided.decision).toMatchObject({ outcome: 'allow', rule: { id: 'allow-notes' } });
});
