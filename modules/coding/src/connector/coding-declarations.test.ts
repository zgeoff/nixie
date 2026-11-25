import { expect, test } from 'bun:test';
import type { EffectDeclaration } from '@heynixie/policy';
import { buildPolicyCall, readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { codingDeclarations } from './coding-declarations';

function setupTest() {
  const declarations: Readonly<Record<string, EffectDeclaration>> = {
    'task.start/atc': codingDeclarations.start,
    'coding.start': codingDeclarations.spawn,
    'coding.stop': codingDeclarations.stop,
    'coding.steer': codingDeclarations.steer,
    'coding.message': codingDeclarations.message,
  };

  const findDeclaration = (tool: string) => declarations[tool] ?? null;

  return {
    decide: readStarterDecisionPoint(findDeclaration),
    decideWithConsent: readStarterDecisionPoint(findDeclaration, {
      readConsent: () =>
        Promise.resolve({ messageSequences: [3], codeCheck: 'pass', checker: 'yes' }),
    }),
  };
}

test.each([
  {
    label: 'a start of a session the user asked for',
    tool: 'task.start/atc',
    toolList: ['task.start'],
    args: { runner: 'atc', name: 'Login fix', brief: 'Fix it.', repo: { url: 'x', ref: 'main' } },
    destinations: [],
    outcome: 'ask',
    rule: 'ask-coding-sessions',
  },
  {
    label: 'a join of a running session',
    tool: 'task.start/atc',
    toolList: ['task.start'],
    args: { runner: 'atc', name: 'Billing', brief: 'Watch it.', session: 'cs4k' },
    destinations: [],
    outcome: 'ask',
    rule: 'ask-coding-sessions',
  },
  {
    label: 'the spawn that a start queued',
    tool: 'coding.start',
    toolList: ['coding.start'],
    args: { name: 'Login fix', prompt: 'Fix it.' },
    destinations: [],
    outcome: 'allow',
    rule: 'allow-coding-spawns',
  },
  {
    label: 'a steer of a bound session',
    tool: 'coding.steer',
    toolList: ['coding.steer'],
    args: { session: 'atc:cloud.3f9a1c2e.1', text: 'Go on.' },
    destinations: ['atc:cloud.3f9a1c2e.1'],
    outcome: 'allow',
    rule: 'allow-coding-input',
  },
  {
    label: 'a note to a bound session',
    tool: 'coding.message',
    toolList: ['coding.message'],
    args: { session: 'atc:cloud.3f9a1c2e.1', text: 'FYI.' },
    destinations: ['atc:cloud.3f9a1c2e.1'],
    outcome: 'allow',
    rule: 'allow-coding-input',
  },
  {
    label: 'a stop of a session that nixie started',
    tool: 'coding.stop',
    toolList: ['coding.stop'],
    args: { session: 'atc:cloud.3f9a1c2e.1', origin: 'started' },
    destinations: ['atc:cloud.3f9a1c2e.1'],
    outcome: 'allow',
    rule: 'allow-stop-started-sessions',
  },
])('it decides $label as $outcome, under the starter rule $rule', async (row) => {
  const ctx = setupTest();

  const decided = await ctx.decide(
    buildPolicyCall({
      tool: row.tool,
      toolList: row.toolList,
      context: 'task',
      sources: ['task'],
      args: row.args,
      destinations: row.destinations.map((value) => ({ value, replyTarget: false })),
    }),
  );

  expect({
    outcome: decided.decision.outcome,
    rule: decided.decision.rule?.id ?? null,
  }).toStrictEqual({
    outcome: row.outcome,
    rule: row.rule,
  });
});

test('it asks before a coding start that the user asked for in the message that started the turn', async () => {
  const ctx = setupTest();

  const decided = await ctx.decideWithConsent(
    buildPolicyCall({
      tool: 'task.start/atc',
      toolList: ['task.start'],
      sources: ['owner'],
      turnMessageSequence: 3,
      args: { runner: 'atc', name: 'Login fix', brief: 'Fix it.', session: 'cs4k' },
    }),
  );

  expect({ outcome: decided.decision.outcome, rule: decided.decision.rule?.id }).toStrictEqual({
    outcome: 'ask',
    rule: 'ask-coding-sessions',
  });
});
