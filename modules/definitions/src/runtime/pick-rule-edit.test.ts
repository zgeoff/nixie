import { expect, test } from 'bun:test';
import { pickRuleEdit } from './pick-rule-edit';

function setupTest() {
  return {
    allowMail: {
      revision: 2,
      rule: {
        id: 'allow-mail',
        outcome: 'allow' as const,
        tools: ['mail.send'],
        destinations: ['harbour@example.org', 'marina@example.org'],
      },
    },
  };
}

test('it refuses a change to a rule that is not in force as not found', () => {
  expect(pickRuleEdit(null, { action: 'remove', revision: 1 })).toStrictEqual({
    status: 'refused',
    code: 'NOT_FOUND',
  });
});

test('it refuses a change at a moved revision with the current revision', () => {
  const ctx = setupTest();

  expect(pickRuleEdit(ctx.allowMail, { action: 'remove', revision: 1 })).toStrictEqual({
    status: 'refused',
    code: 'CONFLICT',
    revision: 2,
  });
});

test('it takes the removal of an allow rule, which narrows', () => {
  const ctx = setupTest();

  expect(pickRuleEdit(ctx.allowMail, { action: 'remove', revision: 2 })).toStrictEqual({
    status: 'write',
    rule: null,
    reason: 'Undo of Always allow',
  });
});

test.each(['ask', 'deny'] as const)(
  'it refuses the removal of a %s rule, which widens',
  (outcome) => {
    const ctx = setupTest();
    const rule = { ...ctx.allowMail, rule: { ...ctx.allowMail.rule, outcome } };

    expect(pickRuleEdit(rule, { action: 'remove', revision: 2 })).toStrictEqual({
      status: 'refused',
      code: 'NOT_ALLOWED',
      reason: 'widens',
    });
  },
);

test('it takes an edit that drops a destination, which narrows', () => {
  const ctx = setupTest();

  expect(
    pickRuleEdit(ctx.allowMail, {
      action: 'edit',
      revision: 2,
      destinations: ['harbour@example.org'],
    }),
  ).toStrictEqual({
    status: 'write',
    rule: { outcome: 'allow', tools: ['mail.send'], destinations: ['harbour@example.org'] },
    reason: 'Edit of the destinations of a rule',
  });
});

test('it refuses an edit that adds a destination, which widens', () => {
  const ctx = setupTest();

  const request = {
    action: 'edit' as const,
    revision: 2,
    destinations: ['harbour@example.org', 'marina@example.org', 'quay@example.org'],
  };

  expect(pickRuleEdit(ctx.allowMail, request)).toStrictEqual({
    status: 'refused',
    code: 'NOT_ALLOWED',
    reason: 'widens',
  });
});

test('it refuses an edit with no destination', () => {
  const ctx = setupTest();

  expect(
    pickRuleEdit(ctx.allowMail, { action: 'edit', revision: 2, destinations: [] }),
  ).toStrictEqual({
    status: 'refused',
    code: 'NOT_ALLOWED',
    reason: 'empty',
  });
});

test('it writes nothing for an edit that leaves the destinations as they are', () => {
  const ctx = setupTest();

  const request = {
    action: 'edit' as const,
    revision: 2,
    destinations: ['marina@example.org', 'harbour@example.org'],
  };

  expect(pickRuleEdit(ctx.allowMail, request)).toStrictEqual({ status: 'unchanged' });
});
