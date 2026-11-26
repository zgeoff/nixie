import { expect, test } from 'bun:test';
import type { RuleCall } from '@heynixie/policy';
import { isRuleMatch } from '@heynixie/policy';
import { buildProposedRule } from './build-proposed-rule';
import type { ProposedRuleCall } from './build-proposed-rule';

function setupTest() {
  const defaults: ProposedRuleCall = {
    tool: 'mail.send',
    context: 'task',
    definitionID: 'weekly-report',
    sources: ['own_data'],
    content: ['body'],
    input: { account: 'work', to: { address: 'sam@example.org' }, body: 'Hello', copies: ['a'] },
    destinations: ['sam@example.org'],
  };

  const call = (change: Partial<ProposedRuleCall> = {}): ProposedRuleCall => ({
    ...defaults,
    ...change,
  });

  const toRuleCall = (proposed: ProposedRuleCall, change: Partial<RuleCall> = {}): RuleCall => ({
    tool: proposed.tool,
    effects: ['send'],
    context: proposed.context,
    task: proposed.definitionID,
    args: proposed.input,
    destinations: proposed.destinations,
    sources: proposed.sources,
    at: defaults.destinations.length,
    ...change,
  });

  return { call, toRuleCall };
}

test('it builds the narrowest rule of 3 identical calls', () => {
  const ctx = setupTest();
  const rule = buildProposedRule([ctx.call(), ctx.call(), ctx.call()]);

  expect(rule).toStrictEqual({
    outcome: 'allow',
    tools: ['mail.send'],
    contexts: ['task'],
    definitions: ['weekly-report'],
    checks: [
      { arg: 'account', op: 'eq', value: 'work' },
      { arg: 'to.address', op: 'eq', value: 'sam@example.org' },
    ],
    destinations: ['sam@example.org'],
    sources: ['own_data'],
  });
});

test('it leaves a check off an argument that held 2 values', () => {
  const ctx = setupTest();

  const rule = buildProposedRule([
    ctx.call(),
    ctx.call({ input: { account: 'home', to: { address: 'sam@example.org' } } }),
  ]);

  expect(rule?.checks).toStrictEqual([{ arg: 'to.address', op: 'eq', value: 'sam@example.org' }]);
});

test('it never checks an argument of free text, or a list', () => {
  const ctx = setupTest();
  const rule = buildProposedRule([ctx.call({ content: ['body', 'account'] })]);

  expect(rule?.checks).toStrictEqual([{ arg: 'to.address', op: 'eq', value: 'sam@example.org' }]);
});

test('it names a definition only when every call came from the same one', () => {
  const ctx = setupTest();
  const rule = buildProposedRule([ctx.call(), ctx.call({ definitionID: 'other-report' })]);

  expect(rule?.definitions).toBeUndefined();
});

test('it names the union of the sources, and none when a call had none', () => {
  const ctx = setupTest();

  const joined = buildProposedRule([
    ctx.call({ sources: ['own_data'] }),
    ctx.call({ sources: ['owner'] }),
  ]);

  const mixed = buildProposedRule([ctx.call({ sources: ['own_data'] }), ctx.call({ sources: [] })]);

  expect({ joined: joined?.sources, mixed: mixed?.sources }).toStrictEqual({
    joined: ['own_data', 'owner'],
    mixed: undefined,
  });
});

test('it leaves destinations off a rule for calls that have none', () => {
  const ctx = setupTest();
  const rule = buildProposedRule([ctx.call({ destinations: [] })]);

  expect(rule?.destinations).toBeUndefined();
});

test('it builds a rule that every counted call matches', () => {
  const ctx = setupTest();
  const first = ctx.call();

  const calls = [
    first,
    ctx.call({ input: { account: 'work', to: { address: 'sam@example.org' }, body: 'Other' } }),
    ctx.call({ sources: ['owner'], definitionID: 'weekly-report' }),
  ] as const;

  const rule = { id: 'proposed', outcome: 'allow' as const, ...buildProposedRule(calls) };

  expect(calls.map((entry) => isRuleMatch(rule, ctx.toRuleCall(entry)))).toStrictEqual([
    true,
    true,
    true,
  ]);
});

test.each([
  ['another tool', { tool: 'mail.draft' }],
  ['another context', { context: 'conversation' as const }],
  ['another task', { task: 'other-report' }],
  ['a destination outside the set', { destinations: ['kim@example.org'] }],
  [
    'another value of a checked argument',
    { args: { account: 'home', to: { address: 'sam@example.org' } } },
  ],
])('it builds a rule that a call with %s does not match', (_name, change) => {
  const ctx = setupTest();
  const counted = ctx.call();
  const rule = { id: 'proposed', outcome: 'allow' as const, ...buildProposedRule([counted]) };

  expect(isRuleMatch(rule, ctx.toRuleCall(counted, change))).toBeFalse();
});

test('it builds a rule that a call to some of the destinations matches', () => {
  const ctx = setupTest();
  const group = ctx.call({ destinations: ['sam@example.org', 'kim@example.org'] });
  const rule = { id: 'proposed', outcome: 'allow' as const, ...buildProposedRule([group]) };

  expect(
    isRuleMatch(rule, ctx.toRuleCall(group, { destinations: ['kim@example.org'] })),
  ).toBeTrue();
});

test('it builds no rule for a destination that holds a wildcard character', () => {
  const ctx = setupTest();
  const star = ctx.call({ destinations: ['*@example.org'] });

  expect(buildProposedRule([star, star, star])).toBeNull();
});

test('it never checks a nested argument of free text', () => {
  const ctx = setupTest();

  const rule = buildProposedRule([
    ctx.call({
      content: ['details.body'],
      input: { to: { address: 'sam@example.org' }, details: { body: 'Hello', kind: 'note' } },
    }),
  ]);

  expect(rule?.checks).toStrictEqual([
    { arg: 'to.address', op: 'eq', value: 'sam@example.org' },
    { arg: 'details.kind', op: 'eq', value: 'note' },
  ]);
});

test('it never checks a free key of an object of free text', () => {
  const ctx = setupTest();

  const rule = buildProposedRule([
    ctx.call({
      content: ['labels.*'],
      input: { to: { address: 'sam@example.org' }, labels: { first: 'Hello' } },
    }),
  ]);

  expect(rule?.checks).toStrictEqual([{ arg: 'to.address', op: 'eq', value: 'sam@example.org' }]);
});
