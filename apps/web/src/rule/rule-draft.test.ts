import { expect, test } from 'bun:test';
import { buildEmptyRuleDraft, toRuleDraft, toRuleForm } from './rule-draft';

test('it turns a rule into a draft and back to the same rule', () => {
  const rule = {
    outcome: 'allow',
    tools: ['mail.send'],
    contexts: ['task'],
    definitions: ['weekly-report'],
    destinations: ['sam@example.org', '*@example.net'],
    sources: ['own_data'],
    checks: [
      { arg: 'account', op: 'eq', value: 'work' },
      { arg: 'copies', op: 'in', value: ['a', 'b'] },
      { arg: 'to.address', op: 'matches', value: '*@example.org' },
    ],
  };

  expect(toRuleForm(toRuleDraft(rule))).toStrictEqual(rule);
});

test('it keeps a field of the rule that the form has no input for', () => {
  const draft = toRuleDraft({ outcome: 'allow', tools: ['mail.send'], note: 'kept' });

  expect(toRuleForm(draft)).toStrictEqual({ outcome: 'allow', tools: ['mail.send'], note: 'kept' });
});

test('it leaves out each field the owner emptied', () => {
  const draft = { ...toRuleDraft({ outcome: 'allow', tools: ['mail.send'] }), tools: ' \n ' };

  expect(toRuleForm(draft)).toStrictEqual({ outcome: 'allow' });
});

test('it splits a list on lines and commas, and trims each entry', () => {
  const draft = {
    ...buildEmptyRuleDraft(),
    destinations: ' a@example.org, b@example.org\n\nc@example.org ',
  };

  expect(toRuleForm(draft)['destinations']).toStrictEqual([
    'a@example.org',
    'b@example.org',
    'c@example.org',
  ]);
});

test('it reads an equality check as a number or a boolean when its text is one', () => {
  const draft = {
    ...buildEmptyRuleDraft(),
    checks: [
      { arg: 'amount', op: 'eq' as const, value: '12' },
      { arg: 'urgent', op: 'eq' as const, value: 'true' },
      { arg: 'label', op: 'eq' as const, value: 'twelve' },
    ],
  };

  expect(toRuleForm(draft)['checks']).toStrictEqual([
    { arg: 'amount', op: 'eq', value: 12 },
    { arg: 'urgent', op: 'eq', value: true },
    { arg: 'label', op: 'eq', value: 'twelve' },
  ]);
});

test('it drops a check with no argument', () => {
  const draft = {
    ...buildEmptyRuleDraft(),
    checks: [{ arg: ' ', op: 'eq' as const, value: 'x' }],
  };

  expect(toRuleForm(draft)).toStrictEqual({ outcome: 'allow' });
});

test('it always makes an allow rule, whatever outcome the source rule held', () => {
  expect(toRuleForm(toRuleDraft({ outcome: 'deny', tools: ['a.b'] }))['outcome']).toBe('allow');
});
