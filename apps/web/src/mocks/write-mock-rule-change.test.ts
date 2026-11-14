import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockRuleChange } from './write-mock-rule-change';

test('it removes an allow rule at the revision shown', async () => {
  await store.rules.create({ ruleID: 'allow-mail', revision: 2 });

  const result = await writeMockRuleChange({ action: 'remove', ruleID: 'allow-mail', revision: 2 });

  expect({ result, rules: store.rules.all().length }).toStrictEqual({
    result: { status: 'changed', revision: 2 },
    rules: 0,
  });
});

test('it refuses a removal at a moved revision with the current revision', async () => {
  await store.rules.create({ ruleID: 'allow-mail', revision: 3 });

  const result = await writeMockRuleChange({ action: 'remove', ruleID: 'allow-mail', revision: 2 });

  expect(result).toStrictEqual({ status: 'refused', error: 'CONFLICT', revision: 3 });
});

test('it refuses to remove a rule that is not an allow rule', async () => {
  await store.rules.create({ ruleID: 'deny-mail', outcome: 'deny' });

  const result = await writeMockRuleChange({ action: 'remove', ruleID: 'deny-mail', revision: 1 });

  expect(result).toStrictEqual({ status: 'refused', error: 'NOT_ALLOWED', reason: 'widens' });
});

test('it refuses a change to a rule that does not exist', async () => {
  const result = await writeMockRuleChange({ action: 'remove', ruleID: 'missing', revision: 1 });

  expect(result).toStrictEqual({ status: 'refused', error: 'NOT_FOUND' });
});

test('it narrows a rule to fewer destinations and moves its revision', async () => {
  await store.rules.create({
    ruleID: 'allow-mail',
    destinations: ['a@example.org', 'b@example.org'],
  });

  const result = await writeMockRuleChange({
    action: 'edit',
    ruleID: 'allow-mail',
    revision: 1,
    destinations: ['a@example.org'],
  });

  expect(result).toStrictEqual({ status: 'changed', revision: 2 });
});

test('it refuses an edit that adds a destination', async () => {
  await store.rules.create({ ruleID: 'allow-mail', destinations: ['a@example.org'] });

  const result = await writeMockRuleChange({
    action: 'edit',
    ruleID: 'allow-mail',
    revision: 1,
    destinations: ['a@example.org', 'b@example.org'],
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'NOT_ALLOWED', reason: 'widens' });
});

test('it refuses an edit that leaves no destination', async () => {
  await store.rules.create({ ruleID: 'allow-mail', destinations: ['a@example.org'] });

  const result = await writeMockRuleChange({
    action: 'edit',
    ruleID: 'allow-mail',
    revision: 1,
    destinations: [],
  });

  expect(result).toStrictEqual({ status: 'refused', error: 'NOT_ALLOWED', reason: 'empty' });
});
